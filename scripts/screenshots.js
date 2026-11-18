#!/usr/bin/env node
// README screenshots: made-up portal pages with AlteX injected, as tests/e2e/portal.js does (same origin, scripts at
// document start), shot on a desktop window (the Chrome extension) and on a phone (the Android app, which keeps the
// classic timetable, student card and homework files, see android/app/build.gradle.kts).
// Made-up student and data only; nothing here talks to the real portal.
// Run: node scripts/screenshots.js  →  docs/screenshots/*.png
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const ORIGIN = 'https://students.alte.edu.ge';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const APP_ONLY = ['css/timetable.css', 'js/timetable.js', 'css/learning-card.css', 'js/learning-card.js', 'css/assignments.css'];
const bundle = (app) => {
  const read = (f) => fs.readFileSync(path.join(ROOT, app && APP_ONLY.includes(f) ? `android/classic/${path.basename(f)}` : f), 'utf8');
  const all = (k) => manifest.content_scripts.flatMap((c) => c[k] || []);
  return { js: all('js').map(read).join('\n;\n'), css: all('css').map(read).join('\n').replaceAll('chrome-extension://__MSG_@@extension_id__/fonts/', '/__altex/fonts/') };
};

const NOW = '2026-11-18T10:05:00+04:00'; // a Wednesday morning, lecture at 10:00 running
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'none' })}.${b64({ id: 1, firstName: 'ლუკა', currentProgram: { eduId: 7 } })}.x`;

// ---------- The portal's own markup (structure copied from the live portal, text made up) ----------
const NAV = [['/personal-data', 'პირადი მონაცემები'], ['/finances', 'ფინანსები'], ['/lms', 'LMS'], ['/calendar', 'განცხადებები', 4],
  ['/gegma-documents', 'დოკუმენტები.'], ['/chancellery', 'ელ.კანცელარია'], ['/programs', 'საგანმანათლებლო პროგრამა'],
  ['/learningCard', 'სასწავლო ბარათი'], ['/registration', 'აკადემიური რეგისტრაცია'], ['/tables', 'ცხრილი']];
const icon = (n) => `<mat-icon role="img" class="mat-icon notranslate material-icons mat-ligature-font mat-icon-no-color">${n}</mat-icon>`;
const header = (active) => `<user-menu-component><div class="dashboard-page"><div class="width"><div class="user-area-wrapper navbar" style="flex-direction: row; box-sizing: border-box; display: flex; place-content: center space-between; align-items: center;">
  <button class="mdc-icon-button mat-mdc-icon-button mat-mdc-button-base toggleButton mat-unthemed">${icon('menu')}</button>
  <a class="user-area" href="/dashboard" style="flex-direction: row; box-sizing: border-box; display: flex;"><div class="company-logo"></div></a>
  <div class="user-menu-top" style="flex-direction: row; box-sizing: border-box; display: flex; place-content: center flex-end; align-items: center;"><div><div class="user-menu"><div class="user-avatar"></div><div class="user-name-wrapper"><span class="userName">ლუკა მაისურაძე</span><span class="schoolName">ბიზნესისა და ტექნოლოგიების სკოლა</span></div>${icon('keyboard_arrow_down')}</div></div></div>
  </div></div>${active === '/dashboard' ? '' : `<div class="topMenuTo"><div class="topMenu canMinimize"><div class="width">
  <button class="mdc-icon-button mat-mdc-icon-button mat-mdc-button-base toggleButton mat-unthemed">${icon('close')}</button><div class="user-area-wrapper"></div>
  <ul class="topMenuItems">${NAV.map(([h, t, n]) => `<li class="topMenuItem"><a class="mat-mdc-tooltip-trigger scrolling${active === h ? ' active' : ''}" href="${h}">${n ? `<div class="notify">${n}</div>` : ''}<div></div><div class="menu-text">${t}</div></a></li>`).join('')}</ul>
  </div></div></div>`}</div></user-menu-component>`;
const page = (active, body) => `<app-root><div>${header(active)}</div><div><div class="all-page-container"><router-outlet></router-outlet>${body}</div></div><br><br><br><br><footer></footer></app-root>`;

const TILES = [...NAV, ['/academic-calendar', 'აკადემიური კალენდარი'], ['/bib', 'ბიბლიოთეკა'], ['/logs', 'ლოგები'], ['/tasks-books', 'დავალებები'],
  ['/commands', 'ბრძანებები'], ['/contracts', 'ხელშეკრულება'], ['/notifications', 'განცხადებები (არქივი)']];
const DASHBOARD = `<dashboard-component><div class="dashboard-page"><div class="width"><div class="dashboard-item-container">${TILES.map(([h, t, n]) =>
  `<a class="dashboard-item-wrapper" href="${h}"><div class="dashboard-item">${n ? `<div class="notify">${n}</div>` : ''}<div class="icon-wrapper"></div><div class="title">${t}</div><span class="mat-badge-content">0</span></div></a>`).join('')}</div></div></div></dashboard-component>`;

// The week: [weekday 0-6, start, minutes, course, room, type, lecturer]
const WEEK = [
  [0, '10:00', 170, 'გამოთვლადობის თეორია', '504', 'ლექცია/სემინარი', 'ნინო ბერიძე'],
  [0, '14:00', 90, 'ვებ-ტექნოლოგიები', '402', 'ლაბორატორია', 'დავით ლომიძე'],
  [1, '10:00', 170, 'ხელოვნური ინტელექტი', '409B', 'ლექცია/სემინარი', 'გიორგი მელაძე'],
  [2, '10:00', 170, 'შესავალი კიბერუსაფრთხოებაში', '405', 'ლექცია/სემინარი', 'ანა კვარაცხელია'],
  [2, '17:00', 180, 'გრაფიკული დიზაინი', '409B', 'ლექცია/სემინარი', 'მარიამ ჯაფარიძე'],
  [3, '14:00', 170, 'React-ის საფუძვლები', '405', 'ლექცია/სემინარი', 'დავით ლომიძე'],
  [5, '10:00', 170, 'არარელაციური მონაცემთა ბაზები', '409B', 'ლექცია/სემინარი', 'ლევან ხუციშვილი'],
];
const DAY_KA = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'];
const lessonItem = ([, time, dur, course, room, type, prof]) =>
  `<div class="day-item"><b>საათი</b>: ${time}<br><b>სასწ.კურსი</b>: ${course}<br><b>ჯგუფი</b>: 101<br><b>ლექტორი</b>: ${prof}<br><b>აუდიტორია</b>: ${room}<br><b>ტიპი</b>: ${type}<br><b>ხანგრძლივობა</b>: ${dur}<br></div>`;
const TIMETABLE = `<tables-dashboard-component><div class="width"><div class="tables-dashboard"><ul class="tables-tab-menu">
  <li><a href="/tables/learningTables" class="active">ლექციები</a></li><li><a href="/tables/ac-tables/1">შუალედური</a></li><li><a href="/tables/ac-tables/2">დასკვნითი</a></li>
</ul></div></div></tables-dashboard-component>
<student-tables-component><div>
  <div class="calendar-navigation"><button class="mat-mdc-button-base">მიმდინარე კვირა</button><div class="monthName">ნოემბერი 2026</div></div>
  <div class="calendar"><div class="weeklist-container">${DAY_KA.map((d, i) => {
    const items = WEEK.filter((l) => l[0] === i);
    return `<div class="headInfo${i === 2 ? ' now' : ''}"><button class="day-title"><span class="mdc-button__label"><div class="day-name">${d}</div><div class="day-number"><div>${16 + i}</div></div></span></button>${items.length || i < 6 ? `<div class="weeklist">${items.map(lessonItem).join('')}</div>` : ''}</div>`;
  }).join('')}</div></div>
</div></student-tables-component>`;

const subject = (name, prof, credit, score, grade) =>
  `<mat-row><mat-cell class="mat-column-bookName">${name}</mat-cell><mat-cell class="mat-column-prof">${prof}</mat-cell><mat-cell class="mat-column-credit">${credit}</mat-cell><mat-cell class="mat-column-score">${score}</mat-cell><mat-cell class="mat-column-result"><span class="result-color">${grade}</span></mat-cell><mat-cell class="mat-column-details"><button>შეფასება</button></mat-cell></mat-row>`;
const parts = (rows) => `<mat-row><mat-cell class="mat-column-expandedDetail"><div class="result-detail-wrapper">${rows.map(([n, v]) => `<div class="result-detail"><div class="result-detail-name">${n}</div><div class="result-detail-result">${v}</div></div>`).join('')}</div></mat-cell></mat-row>`;
const semester = (no, rows) =>
  `<div class="semester-child"><div class="mat-elevation-z8"><mat-table><mat-header-row><mat-header-cell class="mat-column-bookName">${no} სემესტრი</mat-header-cell><mat-header-cell class="mat-column-credit">კრედიტი</mat-header-cell></mat-header-row>${rows.join('')}</mat-table></div></div>`;
const LEARNING_CARD = `<learning-card-component><div class="width page-learningCard">
  <div class="semesters-container"><h3 class="commandsh3">სასწავლო ბარათი</h3><div class="semesters">
    <div class="semester-item"><mat-form-field><div class="mat-mdc-text-field-wrapper"><div class="mat-mdc-form-field-flex"><div class="mat-mdc-form-field-infix"><mat-select class="mat-mdc-select"><div class="mat-mdc-select-value">კომპიუტერული მეცნიერება</div></mat-select></div></div></div></mat-form-field></div>
    <div class="semester-item button"><button class="mat-primary">${icon('list')}</button></div><div class="semester-item button"><button>${icon('date_range')}</button></div>
  </div></div><br>
  <div class="ini-block"><div class="last-stat"><h3>${icon('star')} GPA: <span>3.42</span></h3><h3>${icon('school')}მიღებული კრედიტები: 128</h3><h3>${icon('grade')}<span>საშუალო ქულა</span><b>74.6</b></h3></div></div>
  ${semester(5, [subject('ხელოვნური ინტელექტი', 'გიორგი მელაძე', 5, 41, 'FX'), subject('გამოთვლადობის თეორია', 'ნინო ბერიძე', 5, 38, 'F'),
    parts([['შუალედური', '24'], ['ქვიზები', '14'], ['დასკვნითი', ''], ['ჯამი', '38'], ['შედეგი', 'F']]), subject('შესავალი კიბერუსაფრთხოებაში', 'ანა კვარაცხელია', 5, 46, 'FX'),
    subject('React-ის საფუძვლები', 'დავით ლომიძე', 5, 52, 'E')])}
  ${semester(4, [subject('კალკულუსი II', 'თამარ ლომიძე', 6, 71, 'C'), subject('ვებ-ტექნოლოგიები', 'დავით ლომიძე', 6, 93, 'A'), subject('ალგორითმები', 'ლევან ხუციშვილი', 6, 84, 'B')])}
  ${semester(3, [subject('ფიზიკა', 'ირაკლი გიორგაძე', 6, 66, 'D'), subject('ფილოსოფია', 'მაკა ჩხეიძე', 6, 80, 'B')])}
</div></learning-card-component>`;

const LOGIN = `<app-root><div><div class="all-page-container"><login-component><div class="loginPage"><div class="loginPage-wrapper">
  <div class="logo"></div><h3>ავტორიზაცია</h3><div class="description">შესასვლელად შეიყვანეთ პირადი ნომერი და პაროლი</div>
  <form class="login-form">
    <div class="ini-form-field step-1-form"><input formcontrolname="username" placeholder="პირადი ნომერი"></div>
    <div class="ini-form-field step-1-form"><input formcontrolname="password" type="password" placeholder="პაროლი"></div>
    <div class="buttonWrapper"><button type="submit">შესვლა</button></div>
  </form>
  <div class="login-footer"><a>დაგავიწყდათ პაროლი?</a></div>
</div></div></login-component></div></div></app-root>`;

// ---------- The portal's API answers the pages read ----------
const lesson = ([day, time, dur, course, room, , prof]) => {
  const [h, m] = time.split(':').map(Number);
  return { day, entry: { data: { h, m, duration: dur, profName: prof, activity_type: 'lecture_seminar', auditorium: { name: room } }, item: { book: { name: course } } } };
};
const API = {
  '/student/registration/group/getGroupForRegistration': { selectedGroupId: 3 },
  '/student/registration/getStudentTables': { data: DAY_KA.map((_, i) => WEEK.map(lesson).filter((l) => l.day === i).map((l) => l.entry)) },
  '/student/getStudentTaskBooks/': { data: [{ id: 11, listId: 'a', name: 'გრაფიკული დიზაინი' }, { id: 12, listId: 'b', name: 'React-ის საფუძვლები' }] },
  '/student/tasks/': { data: [
    { name: 'პრაქტიკა და დავალება 7', text: '<p>შეასრულეთ პრაქტიკული დავალება 7 და ატვირთეთ ფაილი <b>PDF</b> ფორმატში.</p>', created_at: '2026-11-18 09:00:00', endDate: '2026-11-25 23:59:00', files: [{ address: `${ORIGIN}/f/task7.pdf`, fileName: 'task7.pdf' }] },
    { name: 'ქვიზი 3', text: 'https://forms.example.org/quiz3', created_at: '2026-11-11 09:00:00', endDate: '2026-11-12 12:00:00', files: [] },
  ] },
  '/student/card': { card: { books: [{ id: 10, name: 'ხელოვნური ინტელექტი', score: 41, semester: 5, prof: 'გიორგი მელაძე' }] } },
  '/student/getCardDetails': { data: [
    { coId: 9, name: 'ქვიზი', componentType: 1, result: '4', updated_at: '2026-11-17T09:00:00.000000Z', items: [{ key: 0, value: '4' }], data: { items: [{ name: 'ქვიზი 2' }] } },
    { coId: 2, name: 'შუალედური გამოცდა', componentType: 1, result: '22', updated_at: '2026-11-03T09:00:00.000000Z', items: [{ key: 0, value: '22' }], data: { items: [{ name: null }] } },
    { coId: 6, name: 'ჯამი', componentType: 3, result: '<b>41</b>', items: [] },
  ] },
};
// The dashboard's latest grade compares with what it saw before: a remembered 37 makes the +4 quiz the new grade.
const STORAGE = { 'Student-Token': TOKEN, 'sx-grades:1': JSON.stringify({ scores: { 10: 37 } }), 'sx-rail': '0' };

const SHOTS = [
  { name: 'dashboard', url: '/dashboard', body: page('/dashboard', DASHBOARD) },
  { name: 'timetable', url: '/tables/learningTables', body: page('/tables', TIMETABLE) },
  { name: 'learning-card', url: '/learningCard', body: page('/learningCard', LEARNING_CARD) },
  { name: 'login', url: '/login', body: LOGIN, storage: {} },
];
const DEVICES = [
  { suffix: '', app: false, use: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.25 } },
  { suffix: '-phone', app: true, use: { ...devices['Pixel 7'] } },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const d of DEVICES) {
    const { js, css } = bundle(d.app);
    for (const shot of SHOTS) {
      const context = await browser.newContext({ ...d.use, locale: 'ka-GE', timezoneId: 'Asia/Tbilisi', colorScheme: 'dark' });
      const p = await context.newPage();
      const storage = shot.storage || STORAGE;
      const init = `<script>for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(k, v)</script>`;
      await p.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (/^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(u.origin)) return route.continue(); // Material Icons, as on the portal
        if (u.origin !== ORIGIN) return route.abort();
        if (route.request().resourceType() === 'document') {
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Student</title><link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons"><style>button { display: inline-flex; align-items: center; justify-content: center; }</style>${init}<style>${css}</style><script>${js.replace(/<\/script/gi, '<\\/script')}</script></head><body>${shot.body}</body></html>` });
        }
        if (u.pathname.startsWith('/__altex/fonts/')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(ROOT, 'fonts', path.basename(u.pathname))) });
        if (u.pathname in API) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(API[u.pathname]) });
        return route.fulfill({ status: 404, body: '' });
      });
      await p.clock.setFixedTime(new Date(NOW));
      await p.goto(ORIGIN + shot.url);
      await p.waitForTimeout(2200); // entrances and data
      await p.mouse.move(0, 0);
      const file = path.join(OUT, `${shot.name}${d.suffix}.png`);
      await p.screenshot({ path: file });
      console.log(path.relative(ROOT, file));
      await context.close();
    }
  }
  await browser.close();
})();
