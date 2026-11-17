// Demo portal shell for the README screenshots: the portal's header (logo, profile button, section links) around
// a page body, plus the FiraGO font (in the extension it comes from chrome-extension://, which a test page can't load).
// Everything here is made up: no real student, lecturer or grade.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const font = (w) => `@font-face { font-family: "FiraGO"; font-weight: ${w}; src: url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'fonts', `firago-${w}.woff2`)).toString('base64')}) format("woff2"); }`;
// body margin: the portal resets it in its own stylesheet, which the demo does not have.
const FONTS = `<style>${font(400)}${font(500)} body { margin: 0; }</style>`;

// The made-up student shown in every screenshot. Change the name here.
const STUDENT_NAME = 'გიორგი ბერიძე';
const STUDENT = { id: 4821, firstName: STUDENT_NAME.split(' ')[0], currentProgram: { eduId: 12 } };

const SECTIONS = [
  ['/calendar', 'განცხადებები', 2],
  ['/registration', 'აკადემიური რეგისტრაცია', 0],
  ['/programs', 'საგანმანათლებლო პროგრამა', 0],
  ['/finances', 'ფინანსები', 0],
  ['/chancellery', 'ელ. კანცელარია', 1],
];

const userArea = () => `<div class="user-area-wrapper navbar" style="display:flex">
  <div class="user-area" style="display:flex;width:100%">
    <a class="company-logo" href="/dashboard"><img alt=""></a>
    <div class="user-menu-top" style="margin-left:auto">
      <div class="user-menu"><div class="user-name-wrapper"><span class="user-name">${STUDENT_NAME}</span></div></div>
    </div>
  </div>
</div>`;

// Inner pages: header bar plus the section links. The dashboard has no links (AlteX builds them from its tiles).
const header = ({ links = true } = {}) => `<user-menu-component>
  <div class="dashboard-page"><div class="width">${userArea()}</div></div>
  ${links ? `<div class="topMenuTo"><div class="topMenu"><div class="width"><ul class="topMenuItems" style="display:flex;list-style:none;margin:0;padding:0">
    ${SECTIONS.map(([href, title, n]) => `<li class="topMenuItem"><a href="${href}"><span class="menu-text">${title}</span><span class="notify">${n}</span></a></li>`).join('')}
  </ul></div></div></div>` : ''}
</user-menu-component>`;

const page = (body, opts) => `${FONTS}<app-root>${header(opts)}<div><div class="all-page-container">${body}</div></div></app-root>`;

module.exports = { page, FONTS, SECTIONS, STUDENT, STUDENT_NAME };
