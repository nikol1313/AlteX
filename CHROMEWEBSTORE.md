# Chrome Web Store Listing — AlteX Student Portal

> Last Updated: 2026-11-13

## Store Listing

**Extension Name** [REQUIRED]
AlteX Student Portal
<!-- Must match manifest.json "name". See Review Notes: consider "AlteX — unofficial redesign for the Alte student portal". -->

**Short Description** [REQUIRED]
Unofficial redesign of the Alte University student portal: clearer timetable, dashboard with next lecture, grades and assignments.
<!-- 128 characters. manifest.json "description" should be updated to match. -->

**Detailed Description** [REQUIRED]
AlteX gives the Alte University student portal (students.alte.edu.ge) a cleaner, easier-to-read design. It is an independent project and is not made by or affiliated with Alte University.

Home page: see your next lecture at a glance, with a countdown, room, lecturer and type, plus a Mon–Sat overview of your week. Your latest grade and newest assignment are shown next to it.
Timetable: each day as a clear card, today highlighted, the lecture in progress marked live, and an exam countdown.
Learning card, finances, registration, documents and other sections: tidier tables and layouts that also work on a phone screen.
Optional: remember your portal login on this computer so you are signed in again when the portal's session ends. Logging out from the portal forgets it.

How to use: install the extension and open students.alte.edu.ge. Nothing to set up.

Privacy: AlteX only runs on students.alte.edu.ge. It shows information the portal already gives you and sends nothing to anyone else. Anything it keeps (your saved login, if you choose to save it, and your last dashboard data so the home page opens instantly) stays in your browser.

Support: [ADD SUPPORT URL OR EMAIL]

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Redesigns the Alte University student portal so its pages are easier to read and use.

**Primary Language** [REQUIRED]
Georgian (UI text is Georgian with English labels)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
1. Home page: next-lecture card with countdown and week strip, grade and assignment cards.
2. Timetable week with today highlighted and a live lecture.
3. Learning card (grades) page.
Use a test or blurred account: screenshots must not show real student names, grades or IDs.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Keeps the student's portal login on this computer, only when they tick "remember", so AlteX can sign them in again when the portal's 24-hour session ends. Removed when they log out. |
| https://students.alte.edu.ge/* | content_scripts matches | The only site AlteX restyles. The redesign (styles and page enhancements) runs on the portal's pages and nowhere else. |
| fonts/*.woff2 | web_accessible_resources (portal only) | The bundled FiraGO font files, which the redesigned pages use for Georgian text. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Nothing leaves the device. Data is handled locally, so declare it.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Read on device (first name, student ID from the portal session) | No | Greeting; keeping saved data per student | No |
| Health info | No | No | | No |
| Financial info | Read on device (portal finance page) | No | Restyled finance summary | No |
| Authentication info | Stored on device, opt-in (portal username and password) | No | Automatic sign-in when the portal session ends | No |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No | | No |
| User activity | No | No | | No |
| Website content | Read and cached on device (timetable, grades, assignments) | No | Dashboard cards; instant home page | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
[NOT CREATED — needed, because the extension stores login details. Host it, e.g. on GitHub Pages.]

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

**Contact Email** [REQUIRED]

**Support URL / Email** [RECOMMENDED]

**Homepage URL** [RECOMMENDED]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 3.4.0 | 2026-11-13 | First Chrome Web Store submission | Draft |

## Review Notes

### Known Issues / Limitations
- Name and logo reference "Alte": the listing must say clearly that AlteX is unofficial (trademark/impersonation review).
- Saved login (opt-in) is kept unencrypted in Chrome's extension storage on disk. Say so in the privacy policy.
- Small UI preferences and the dashboard cache are kept in the portal site's own storage, which is shared with the Android app build. They stay behind after uninstall; logging out clears the dashboard cache.
- Package the extension without android/, README.md, CHROMEWEBSTORE.md, altex-128x128.png and .github/.

### Rejection History
