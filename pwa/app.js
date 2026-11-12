'use strict';
// AlteX PWA. Everything here works offline from shared/ data; personal portal data is never read or stored.
const PORTAL = 'https://students.alte.edu.ge';
const $id = (id) => document.getElementById(id);

// Portal pages a student opens most (same sections as the extension's nav bar and dashboard).
const PORTAL_LINKS = [
  ['/tables', 'ცხრილი', 'ლექციები და გამოცდები'],
  ['/learningCard', 'სასწავლო ბარათი', 'ქულები და შეფასებები'],
  ['/tasks-books', 'დავალებები', 'ლექტორების დავალებები'],
  ['/finances', 'ფინანსები', 'გადახდის გრაფიკი'],
  ['/registration', 'რეგისტრაცია', 'საგნების არჩევა'],
  ['/programs', 'პროგრამა', 'საგანმანათლებლო პროგრამა'],
  ['/calendar', 'განცხადებები', 'უნივერსიტეტის ამბები'],
  ['/chancellery', 'ელ. კანცელარია', 'ცნობები და განცხადებები'],
  ['/lms', 'LMS', 'სასწავლო პლატფორმა'],
];

// What the installed app can do itself vs. what stays on the portal (see README for the reason).
const FEATURES = [
  ['გამოცდებამდე დარჩენილი დღეები', 'app'],
  ['აკადემიური კალენდარი და დასვენების დღეები', 'app'],
  ['მუშაობს ინტერნეტის გარეშე', 'app'],
  ['სწრაფი ბმულები პორტალის გვერდებზე', 'app'],
  ['შემდეგი ლექცია და დღის ცხრილი', 'portal'],
  ['ბოლო შეფასება, ქულები, GPA', 'portal'],
  ['ბოლო დავალებები', 'portal'],
  ['ფინანსები და გადახდის ათვლა', 'portal'],
  ['რეგისტრაცია, პროგრამა, კანცელარია', 'portal'],
];
const STATE_LABEL = { app: 'აპში', portal: 'პორტალზე' };

const renderHome = () => {
  const now = new Date();
  $id('today-date').textContent = `${WEEKDAYS[weekdayOf(now)]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const off = nextPeriod(DAYS_OFF);
  const offName = off && DAYS_OFF.find(([a]) => dayOf(a).getTime() === off.start.getTime())[2];
  const running = upcomingExams().find((x) => x.p.state === 'now');
  let line;
  if (off && off.state === 'now') line = `დღეს დასვენების დღეა · ${offName}`;
  else if (running) line = `მიმდინარეობს: ${running.e.ka.toLowerCase()}`;
  else if (weekdayOf(now) === 6) line = 'დღეს კვირაა — დაისვენე.';
  else if (off) line = `შემდეგი დასვენება: ${offName}, ${daysWord(off.days)}`;
  else line = '';
  $id('today-line').textContent = line;
  fillExamStrip($id('exam-strip'));
};

const renderAgenda = () => {
  const t = today0();
  const items = [
    ...SEMESTER_STARTS.map((d, i) => ({ start: dayOf(d), end: dayOf(d), title: `${i === 0 ? 'საშემოდგომო' : 'საგაზაფხულო'} სემესტრის დაწყება`, sub: i === 0 ? 'Fall semester starts' : 'Spring semester starts', kind: 'start' })),
    ...EXAMS.flatMap((e) => e.periods.map(([a, b]) => ({ start: dayOf(a), end: dayOf(b), title: e.ka, sub: e.en, kind: 'exam' }))),
    ...DAYS_OFF.map(([a, b, ka, en]) => ({ start: dayOf(a), end: dayOf(b), title: ka, sub: en, kind: 'off' })),
  ].sort((x, y) => x.start - y.start);
  const months = new Map();
  for (const it of items) {
    const k = `${it.start.getFullYear()}-${it.start.getMonth()}`;
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(it);
  }
  $id('agenda').replaceChildren(...[...months.values()].map((list) => {
    const m = el('section', 'agenda-month');
    m.append(el('h2', null, `${MONTHS[list[0].start.getMonth()]} ${list[0].start.getFullYear()}`));
    const ul = el('ul', 'agenda-list');
    ul.append(...list.map((it) => {
      const when = it.end < t ? 'past' : it.start <= t ? 'now' : 'future';
      const li = el('li', 'agenda-item');
      li.dataset.kind = it.kind;
      li.dataset.when = when;
      const day = el('div', 'agenda-day');
      day.append(el('b', null, String(it.start.getDate())), el('small', null, WEEKDAYS[weekdayOf(it.start)].slice(0, 3)));
      const what = el('div', 'agenda-what');
      const range = it.start.getTime() === it.end.getTime() ? '' : rangeText(it.start, it.end);
      what.append(el('strong', null, it.title), el('span', null, [it.sub, range].filter(Boolean).join(' · ')));
      if (when === 'now') what.append(el('span', 'agenda-badge', 'ახლა'));
      else if (when === 'future' && daysUntil(it.start) <= 14) what.append(el('span', 'agenda-badge', daysWord(daysUntil(it.start))));
      li.append(day, what);
      return li;
    }));
    m.append(ul);
    return m;
  }));
};

const portalLink = (href, title, sub, cls) => {
  const a = el('a', 'link-tile' + (cls ? ' ' + cls : ''));
  a.href = PORTAL + href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(el('strong', null, title), el('span', null, sub));
  return a;
};
const renderPortal = () => {
  $id('portal-links').replaceChildren(
    portalLink('/', 'პორტალის გახსნა ↗', 'students.alte.edu.ge', 'main'),
    ...PORTAL_LINKS.map(([href, title, sub]) => portalLink(href, title, sub)),
  );
  $id('features').replaceChildren(...FEATURES.map(([text, state]) => {
    const li = el('li', 'feature');
    li.dataset.state = state;
    li.append(el('span', null, text), el('em', null, STATE_LABEL[state]));
    return li;
  }));
};

// Tabs live in the URL hash, so the back button and the manifest shortcuts (#exams, #portal) work.
const VIEW_OF = { exams: 'home' };
const showView = () => {
  const want = location.hash.slice(1) || 'home';
  const view = document.getElementById(VIEW_OF[want] || want)?.hasAttribute('data-view') ? (VIEW_OF[want] || want) : 'home';
  for (const v of document.querySelectorAll('[data-view]')) v.hidden = v.id !== view;
  for (const a of document.querySelectorAll('[data-tab]')) {
    if (a.dataset.tab === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (want !== view) document.getElementById(want)?.scrollIntoView(); else window.scrollTo(0, 0);
};

const watchNetwork = () => {
  const update = () => { $id('net').hidden = navigator.onLine; };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
};

// Service worker: a new version waits until the student taps "განახლება", then the page reloads once.
const registerWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  // Reload only after the student asked for the update (the first install's clients.claim() also fires controllerchange).
  let updateAsked = false, reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAsked && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      $id('update-toast').hidden = false;
      $id('update-go').onclick = () => { updateAsked = true; worker.postMessage({ type: 'SKIP_WAITING' }); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* app still works online without a worker */ });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.version) $id('version').textContent = `· v${e.data.version}`; });
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'VERSION' }));
};

const startApp = () => {
  renderHome();
  renderAgenda();
  renderPortal();
  showView();
  window.addEventListener('hashchange', showView);
  watchNetwork();
  initInstall();
  registerWorker();
  // Countdowns roll over at midnight even when the app stays open.
  setInterval(() => { renderHome(); renderAgenda(); }, 60 * 1000);
};
startApp();
