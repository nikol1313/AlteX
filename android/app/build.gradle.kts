import groovy.json.JsonOutput
import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
}

// The extension at the repo root is the single source of truth: its manifest.json lists the
// content scripts and styles in load order, and its version becomes the app version.
val extDir: File = rootProject.projectDir.parentFile
@Suppress("UNCHECKED_CAST")
val extManifest = JsonSlurper().parse(extDir.resolve("manifest.json")) as Map<String, Any>
@Suppress("UNCHECKED_CAST")
val contentScript = (extManifest["content_scripts"] as List<Map<String, Any>>).single()
val extVersion = extManifest["version"] as String
val (vMajor, vMinor, vPatch) = extVersion.split(".").map(String::toInt)

/**
 * Builds assets/altex.js (every content-script CSS and JS file, in manifest order, as one script the
 * WebView injects at document start) and copies the fonts to assets/fonts/.
 */
abstract class BundleExtension : DefaultTask() {
    @get:InputFiles abstract val cssFiles: ConfigurableFileCollection
    @get:InputFiles abstract val jsFiles: ConfigurableFileCollection
    @get:InputFiles abstract val fontFiles: ConfigurableFileCollection
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun bundle() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        out.resolve("fonts").mkdirs()
        fontFiles.files.forEach { it.copyTo(out.resolve("fonts/${it.name}")) }

        // The extension loads fonts from chrome-extension://…/fonts/; the app serves them on the
        // portal's own origin under /__altex/fonts/ (see MainActivity.FONT_PATH).
        val css = cssFiles.files.joinToString("\n") { it.readText() }
            .replace("chrome-extension://__MSG_@@extension_id__/fonts/", "/__altex/fonts/")
        val js = jsFiles.files.joinToString("\n") { "// ---- ${it.name}\n${it.readText()}" }

        // Anything extension-only left over would silently break in the app, so fail the build instead.
        for ((name, text) in listOf("css" to css, "js" to js)) {
            Regex("""chrome-extension://|__MSG_|\b(chrome|browser)\.(runtime|storage|tabs|i18n)\b""")
                .find(text)?.let { throw GradleException("Extension-only API in bundled $name: '${it.value}'") }
        }

        // One function scope: the files still share top-level names with each other (as content
        // scripts do), but not with the portal's own scripts, since this runs in the page's world.
        out.resolve("altex.js").writeText(
            listOf(
                "// Generated from the extension's manifest.json by android/app/build.gradle.kts. Do not edit.",
                "(() => {",
                "'use strict';",
                "if (window.top !== window || window.__altexLoaded) return;",
                "window.__altexLoaded = true;",
                "{",
                "  const style = document.createElement('style');",
                "  style.id = 'altex-css';",
                "  style.textContent = ${JsonOutput.toJson(css)};",
                "  (document.head || document.documentElement).append(style);",
                "}",
                js,
                "})();",
                "",
            ).joinToString("\n")
        )
    }
}

val bundleExtension = tasks.register<BundleExtension>("bundleExtension") {
    @Suppress("UNCHECKED_CAST")
    cssFiles.from((contentScript["css"] as List<String>).map(extDir::resolve))
    @Suppress("UNCHECKED_CAST")
    jsFiles.from((contentScript["js"] as List<String>).map(extDir::resolve))
    fontFiles.from(fileTree(extDir.resolve("fonts")) { include("*.woff2") })
    outputDir.set(layout.buildDirectory.dir("generated/altex-assets"))
}

android {
    namespace = "io.github.nikol1313.altex"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.nikol1313.altex"
        minSdk = 24
        targetSdk = 35
        versionName = extVersion
        versionCode = vMajor * 10000 + vMinor * 100 + vPatch
    }

    // Release signing comes from the environment (GitHub Actions secrets, see android/README.md).
    val keystore = System.getenv("ALTEX_KEYSTORE")
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storeType = "pkcs12"
                storePassword = System.getenv("ALTEX_KEYSTORE_PASSWORD")
                keyAlias = "altex"
                keyPassword = System.getenv("ALTEX_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(bundleExtension, BundleExtension::outputDir)
    }
}

dependencies {
    // AndroidX pulls in kotlin-stdlib 1.8 plus old kotlin-stdlib-jdk7/jdk8 1.6 (duplicate classes).
    // The Kotlin plugin normally aligns them; this Java-only app does it with the BOM.
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
