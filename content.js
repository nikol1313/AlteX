// Alte Portal — riddled.ai style
// 1. Marks <html> so styles.css applies.
// 2. Marks zero counts (hidden) and grade letters (failing ones get the accent).
// 3. Adds an "idc" button to the notification popup: close it and go to the dashboard.
// 4. AlteX wordmark (CSS) and a once-per-session welcome splash.
// 5. Navigation bar: main sections in one row, the rest under "მეტი · More".
// 6. Learning card: current semester open, older ones folded; score bars.
// 7. Timetable page: clearer day blocks, foldable left menu, exam cards.
// 8. Finances summary card; applications calendar as a list; timetable loading skeleton.
// 9. On the dashboard, fills the three main sections with a few lines of real data,
//    read from the same read-only endpoints the portal itself uses, with the
//    session the portal already stored. Nothing is written; no site behaviour changes.
// 10. Academic calendar (exam periods, days off): countdowns on the timetable and dashboard.
// 11. Assignments page: per course, a fold with the five latest assignments.
// 12. Login page: brand panel with an animated week.
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('sx');

  const WEEKDAYS = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'];
  const CACHE_MS = 5 * 60 * 1000;

  // ---------- counts ----------
  const tagZeroCounts = () => {
    for (const el of document.querySelectorAll('.notify, .mat-badge-content')) {
      const zero = el.textContent.trim() === '0';
      if (el.hasAttribute('data-sx-zero') !== zero) el.toggleAttribute('data-sx-zero', zero);
    }
    // The site's Result-* classes don't match the letter shown; tag the real letter.
    for (const el of document.querySelectorAll('.result-color')) {
      const g = el.textContent.trim().toUpperCase();
      if (el.dataset.grade !== g) el.dataset.grade = g;
    }
  };

  // ---------- API (read-only) ----------
  const session = () => {
    const token = localStorage.getItem('Student-Token');
    if (!token) return null;
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { token, studentId: claims.id, eduId: claims.currentProgram && claims.currentProgram.eduId };
    } catch { return null; }
  };

  const api = async (s, path, body) => {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + s.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.json();
  };

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Same shape the timetable page sends: Monday..Sunday of a week.
  const weekDates = (offsetWeeks) => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7 * offsetWeeks);
    return WEEKDAYS.map((day, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return { d: i + 1, day, number: String(d.getDate()), date: isoDate(d), month: d.toLocaleString('en-US', { month: 'long' }) };
    });
  };

  const dayLabel = (date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - today) / 86400000);
    if (diff === 0) return 'დღეს';
    if (diff === 1) return 'ხვალ';
    return WEEKDAYS[(date.getDay() + 6) % 7];
  };

  // "in 1h 14m" / "in 3 days", in Georgian.
  const untilText = (ms) => {
    const min = Math.max(0, Math.round((ms - Date.now()) / 60000));
    if (min < 1) return 'ახლა';
    if (min < 60) return `${min} წთ-ში`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} სთ ${min % 60} წთ-ში`;
    const days = Math.round(min / 1440);
    return days === 1 ? 'ხვალ' : `${days} დღეში`;
  };
  const dmy = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const claimsOf = (s) => {
    try { return JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
  };
  const firstNameOf = (s) => {
    let name = claimsOf(s).firstName || '';
    try { name = decodeURIComponent(escape(name)); } catch { /* already decoded */ }
    return name;
  };

  // ---------- Academic calendar 2026/2027 (bachelor programmes) ----------
  // Dates as published by the university; replace this block when the next year's calendar is out.
  const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
  const SEMESTER_STARTS = ['2026-09-14', '2027-02-22'];
  const EXAMS = [
    { key: 'midterm', ka: 'შუალედური გამოცდები', en: 'Midterm exams', periods: [['2026-11-02', '2026-11-07'], ['2027-04-12', '2027-04-17']] },
    { key: 'retake', ka: 'შუალედურის გადაბარება', en: 'Midterm retakes', periods: [['2027-01-04', '2027-01-09'], ['2027-06-07', '2027-06-12']] },
    { key: 'final', ka: 'დასკვნითი გამოცდები', en: 'Final exams', periods: [['2027-01-11', '2027-01-23'], ['2027-06-14', '2027-06-26']] },
  ];
  const DAYS_OFF = [
    ['2026-10-14', '2026-10-14', 'მცხეთობა', 'Mtskhetoba'],
    ['2026-11-23', '2026-11-23', 'გიორგობა', 'Giorgoba'],
    ['2026-12-27', '2027-01-03', 'საახალწლო არდადეგები', 'New Year holidays'],
    ['2027-01-07', '2027-01-07', 'შობა', 'Christmas'],
    ['2027-01-19', '2027-01-19', 'ნათლისღება', 'Epiphany'],
    ['2027-03-03', '2027-03-03', 'დედის დღე', "Mother's Day"],
    ['2027-03-08', '2027-03-08', 'ქალთა საერთაშორისო დღე', "International Women's Day"],
    ['2027-04-09', '2027-04-09', 'ეროვნული ერთიანობის დღე', 'National Unity Day'],
    ['2027-04-30', '2027-05-03', 'სააღდგომო არდადეგები', 'Easter holidays'],
    ['2027-05-09', '2027-05-09', 'ფაშიზმზე გამარჯვების დღე', 'Victory over Fascism Day'],
    ['2027-05-12', '2027-05-12', 'წმ. ანდრია პირველწოდებულის დღე', 'St. Andrew the First-Called Day'],
    ['2027-05-26', '2027-05-26', 'დამოუკიდებლობის დღე', 'Independence Day of Georgia'],
  ];
  const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysUntil = (date) => Math.round((date - today0()) / 86400000);
  const rangeText = (a, b) => {
    if (a.getTime() === b.getTime()) return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
    if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS[a.getMonth()]}`;
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
  };
  // The first period that has not ended yet: { state: 'soon' | 'now', days, start, end }, or null.
  const nextPeriod = (periods) => {
    const t = today0();
    for (const [a, b] of periods) {
      const start = dayOf(a), end = dayOf(b);
      if (end < t) continue;
      return start <= t ? { state: 'now', days: 0, left: daysUntil(end), start, end } : { state: 'soon', days: daysUntil(start), start, end };
    }
    return null;
  };
  const daysWord = (n) => (n === 1 ? 'ხვალ' : `${n} დღეში`);

  // "You have / had today": past tense once every lecture of the day has ended.
  // lessons: [{ start, end (ms), name }] for today.
  const todayLine = (lessons) => {
    const list = [...lessons].sort((x, y) => x.start - y.start);
    if (!list.length) return 'დღეს ლექციები არ გაქვს';
    const now = Date.now();
    const left = list.filter((l) => l.end > now);
    const label = (l) => `${l.name || 'ლექცია'}, ${hm(new Date(l.start))}`;
    if (!left.length) return list.length === 1 ? `დღეს გქონდა 1 ლექცია: ${label(list[0])}` : `დღეს გქონდა ${list.length} ლექცია · ყველა დასრულდა`;
    if (left.length < list.length) return `დღეს გაქვს კიდევ ${left.length} ლექცია · შემდეგი: ${label(left[0])}`;
    return list.length === 1 ? `დღეს გაქვს 1 ლექცია: ${label(list[0])}` : `დღეს გაქვს ${list.length} ლექცია · პირველი: ${label(list[0])}`;
  };
  const isToday = (ms) => { const t = today0().getTime(); return ms >= t && ms < t + 86400000; };
  let knownLessons = null; // this week's lessons once the dashboard has loaded them

  // Each loader returns a function: the text is rebuilt at render time, so countdowns stay current.
  // Latest grade: the portal gives scores without dates, so the scores seen last time are
  // remembered per student (localStorage); a score that differs from them is the new grade.
  const NO_GRADE = { lines: ['ახალი შეფასება ჯერ არ დადებულა'], caption: 'No new grades have been posted yet', empty: true };
  const loadCard = async (s) => {
    const res = await api(s, '/student/card');
    const books = ((res && res.card && res.card.books) || []).filter((b) => b && b.id != null && typeof b.score === 'number');
    if (!books.length) return null;
    const key = `sx-grades:${s.studentId}`;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(key)); } catch { /* start over */ }
    let last = (stored && stored.last) || null;
    if (stored && stored.scores) {
      const changed = books
        .filter((b) => (b.id in stored.scores ? stored.scores[b.id] !== b.score : b.score > 0))
        .sort((x, y) => (Number(y.semester) || 0) - (Number(x.semester) || 0));
      if (changed.length) {
        const b = changed[0];
        const delta = Math.round((b.score - (stored.scores[b.id] || 0)) * 100) / 100;
        last = { name: b.name, score: b.score, delta, result: b.result || '', at: Date.now() };
      }
    }
    const scores = {};
    for (const b of books) scores[b.id] = b.score;
    try { localStorage.setItem(key, JSON.stringify({ scores, last })); } catch { /* shown for this visit only */ }
    return () => {
      if (!last) return NO_GRADE;
      const change = last.delta > 0 ? `+${last.delta} ქულა` : last.delta < 0 ? `${last.delta} ქულა` : '';
      return {
        lines: [`${last.score} / 100`, last.name, [change, dmy(new Date(last.at))].filter(Boolean).join(' · ')],
        caption: 'ბოლო შეფასება · Latest grade',
      };
    };
  };

  const loadNextLecture = async (s) => {
    const group = await api(s, '/student/registration/group/getGroupForRegistration', {});
    const groupId = group && group.selectedGroupId;
    if (!groupId) return null;
    const lessons = [];
    for (const week of [0, 1]) {
      const dates = weekDates(week);
      const res = await api(s, '/student/registration/getStudentTables', { studentId: s.studentId, eduId: s.eduId, groupId, dates });
      ((res && res.data) || []).forEach((entries, i) => {
        for (const e of entries || []) {
          const d = e && e.data;
          if (!d || d.h == null) continue;
          const [y, m, dd] = dates[i].date.split('-').map(Number);
          const start = new Date(y, m - 1, dd, d.h, d.m || 0);
          lessons.push({
            start, end: start.getTime() + (d.duration || 0) * 60000,
            course: e.item && e.item.book && e.item.book.name, room: d.auditorium && d.auditorium.name,
          });
        }
      });
      if (lessons.some((l) => l.end > Date.now())) break;
    }
    lessons.sort((x, y) => x.start - y.start);
    knownLessons = lessons;
    return () => {
      const now = Date.now();
      const next = lessons.find((l) => l.end > now);
      if (!next) return { lines: ['ლექციები არ არის'], caption: 'ამ და მომდევნო კვირაში' };
      const live = next.start.getTime() <= now;
      const lines = [live ? 'მიმდინარეობს ახლა' : untilText(next.start.getTime())];
      if (next.course) lines.push(next.course);
      const when = live ? `მთავრდება ${hm(new Date(next.end))}` : `${dayLabel(next.start)}, ${hm(next.start)}`;
      lines.push(next.room ? `${when} · აუდიტორია ${next.room}` : when);
      return { lines, caption: live ? 'მიმდინარე ლექცია' : 'შემდეგი ლექცია' };
    };
  };

  // Assignments of one course, newest first.
  const taskCache = new Map(); // listId -> Promise<task[]>
  const courseTasks = (s, listId) => {
    if (!taskCache.has(listId)) {
      const p = api(s, '/student/tasks/?page=1&limit=10', { listId }).then((r) => ((r && r.data) || [])
        .map((t) => ({ ...t, posted: parseDate(t.created_at), end: parseDate(t.endDate) }))
        .sort((x, y) => (y.posted || 0) - (x.posted || 0)));
      p.catch(() => taskCache.delete(listId)); // a failed request is retried on the next visit
      taskCache.set(listId, p);
    }
    return taskCache.get(listId);
  };
  let taskBooksCache = null; // Promise<book[]>
  const taskBooks = (s) => {
    if (!taskBooksCache) {
      taskBooksCache = api(s, '/student/getStudentTaskBooks/?page=1&limit=10', { registrationGroupId: '' }).then((r) => (r && r.data) || []);
      taskBooksCache.catch(() => { taskBooksCache = null; });
    }
    return taskBooksCache;
  };
  const agoText = (date) => {
    const days = -daysUntil(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    return days <= 0 ? 'დღეს' : days === 1 ? 'გუშინ' : `${days} დღის წინ`;
  };

  // Latest assignment: the most recently posted task across the student's courses.
  const NO_TASK = { lines: ['ახალი დავალება ჯერ არ დადებულა'], caption: 'No new assignments have been posted yet', empty: true };
  const loadTasks = async (s) => {
    const list = await taskBooks(s);
    const perBook = await Promise.allSettled(list.map((b) => courseTasks(s, b.listId)));
    const all = [];
    perBook.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      for (const t of r.value) if (t.posted) all.push({ ...t, course: list[i].name });
    });
    all.sort((x, y) => y.posted - x.posted);
    const latest = all[0];
    return () => {
      if (!latest) return NO_TASK;
      const lines = [latest.name, latest.course, `დაემატა ${agoText(latest.posted)} · ${dmy(latest.posted)}`];
      if (latest.end) lines.push(`ვადა ${dmy(latest.end)} ${hm(latest.end)}`);
      return { lines: lines.filter(Boolean), caption: 'ბოლო დავალება · Latest assignment' };
    };
  };

  const SECTIONS = { '/tables': loadNextLecture, '/tasks-books': loadTasks, '/learningCard': loadCard };
  const FALLBACK = () => ({ lines: [], caption: 'გახსენით სანახავად' });
  let cache = null; // { at, results: { href: () => ({lines, caption}) } }
  let loading = false;

  const load = async () => {
    if (loading || (cache && Date.now() - cache.at < CACHE_MS)) return;
    const s = session();
    if (!s || !s.eduId) { cache = { at: Date.now(), results: {} }; render(); return; }
    loading = true;
    const hrefs = Object.keys(SECTIONS);
    const settled = await Promise.allSettled(hrefs.map((h) => SECTIONS[h](s)));
    const results = {};
    settled.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) results[hrefs[i]] = r.value; });
    cache = { at: Date.now(), results };
    loading = false;
    render();
  };

  // ---------- render into the dashboard ----------
  const render = () => {
    for (const href of Object.keys(SECTIONS)) {
      const item = document.querySelector(`a.dashboard-item-wrapper[href="${href}"] .dashboard-item`);
      if (!item) continue;
      const result = cache ? (cache.results[href] || FALLBACK)() : null;
      const key = result ? JSON.stringify(result) : '';
      let box = item.querySelector(':scope > .sx-data');
      if (box && box.dataset.key === key) continue;
      if (!result) { if (box) box.remove(); continue; }
      if (!box) { box = document.createElement('div'); box.className = 'sx-data'; item.append(box); }
      box.dataset.key = key;
      box.classList.toggle('sx-none', !!result.empty);
      box.replaceChildren(
        ...result.lines.map((t) => Object.assign(document.createElement('span'), { className: 'sx-val', textContent: t })),
        Object.assign(document.createElement('span'), { className: 'sx-cap', textContent: result.caption }),
      );
    }
  };

  // ---------- "idc" button on the site's notification popup ----------
  // Closes the popup the way Material does (Escape), then goes to the dashboard
  // through the portal's own link, so Angular routes in-app without a reload.
  const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
  const goHome = () => {
    if (location.pathname === '/dashboard') return;
    const link = document.querySelector('a.user-area[href="/dashboard"]');
    if (link) link.click(); else location.assign('/dashboard');
  };
  let wantStatementList = 0;
  const goStatementList = () => {
    if (!wantStatementList) return;
    if (Date.now() - wantStatementList > 15000) { wantStatementList = 0; return; } // never got there: forget it
    const tab = document.querySelector('a[href="/calendar/statementList"]');
    if (!tab) return;
    wantStatementList = 0;
    if (location.pathname !== '/calendar/statementList') tab.click();
  };
  const mountIdc = () => {
    for (const actions of document.querySelectorAll('alert-dialog .mat-mdc-dialog-actions')) {
      if (actions.querySelector(':scope > .sx-idc')) continue;
      const view = actions.querySelector('button');
      if (!/ნახვა/.test(view?.textContent || '')) continue; // e.g. lecturer info: Ok only
      // The site's ნახვა opens the calendar tab; remember to switch to the statement list once there.
      view.addEventListener('click', () => { wantStatementList = Date.now(); }, true);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sx-idc';
      btn.textContent = 'idc';
      btn.addEventListener('click', () => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', ESCAPE));
        goHome();
      });
      actions.append(btn);
    }
  };

  // ---------- Navigation bar: "მეტი · More" ----------
  // Secondary sections are hidden in the bar (CSS) and listed in a dropdown.
  // Picking one clicks the site's own link, so Angular routes as usual.
  // Bar: announcements, registration, programme, finances, e-office (order set in CSS).
  // The learning card, timetable and assignments are the three boxes of the main page.
  const NAV_MAIN = ['/calendar', '/registration', '/programs', '/finances', '/chancellery'];
  const NAV_MORE = [
    { href: '/lms', ka: 'LMS', en: 'Learning platform' },
    { href: '/academic-calendar', ka: 'აკადემიური კალენდარი', en: 'Academic calendar' },
    { href: '/gegma-documents', ka: 'დოკუმენტები', en: 'Documents' },
    { href: '/bib', ka: 'ბიბლიოთეკა', en: 'Library' },
    { href: '/commands', ka: 'ბრძანებები', en: 'Orders' },
    { href: '/contracts', ka: 'ხელშეკრულება', en: 'Contracts' },
    { href: '/notifications', ka: 'განცხადებები (არქივი)', en: 'Announcements archive' },
    { href: '/logs', ka: 'ლოგები', en: 'Activity log' },
  ];
  // Route inside the portal: through the site's own link when the page has one, otherwise
  // through the history API, which the Angular router follows without a reload.
  const go = (href) => {
    const a = document.querySelector(`.topMenuItem > a[href="${href}"]:not([data-sx-href]), a.dashboard-item-wrapper[href="${href}"]`);
    if (a) { a.click(); return; }
    history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  };
  const closeMore = () => document.querySelector('.sx-more.sx-open')?.classList.remove('sx-open');
  const placeMore = (li) => {
    const r = li.querySelector('.sx-more-btn').getBoundingClientRect();
    const menu = li.querySelector('.sx-more-menu');
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 316)))}px`;
  };
  const mountNav = () => {
    const list = document.querySelector('.topMenuItems');
    if (!list) return;
    let li = list.querySelector(':scope > .sx-more');
    if (!li) {
      li = el('li', 'sx-more');
      const btn = el('button', 'sx-more-btn', 'მეტი');
      btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      const menu = el('div', 'sx-more-menu');
      menu.setAttribute('role', 'menu');
      menu.append(...NAV_MORE.map(({ href, ka, en }) => {
        const b = el('button', 'sx-more-item');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.dataset.href = href;
        b.append(el('span', 'sx-ka', ka), el('span', 'sx-en', en));
        return b;
      }));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !li.classList.contains('sx-open');
        li.classList.toggle('sx-open', open);
        btn.setAttribute('aria-expanded', String(open));
        if (open) placeMore(li);
      });
      menu.addEventListener('click', (e) => {
        const item = e.target.closest('.sx-more-item');
        if (!item) return;
        closeMore();
        go(item.dataset.href);
      });
      li.append(btn, menu);
      list.append(li);
    }
    const path = location.pathname;
    let any = false;
    for (const item of li.querySelectorAll('.sx-more-item')) {
      const active = path === item.dataset.href || path.startsWith(item.dataset.href + '/');
      any = any || active;
      item.classList.toggle('sx-active', active);
    }
    li.classList.toggle('sx-active', any);
  };
  // Dashboard: the site shows no nav bar there, so build one from the dashboard's own
  // links (same markup as the inner-page bar, so the same CSS and "More" apply).
  // Each item clicks the original dashboard link, which Angular routes.
  const mountDashNav = () => {
    const existing = document.querySelector('.sx-dash-nav');
    if (!document.querySelector('dashboard-component')) { existing?.remove(); return; }
    const host = document.querySelector('user-menu-component .dashboard-page');
    if (!host) return;
    let nav = existing;
    if (!nav) {
      nav = el('div', 'topMenuTo sx-dash-nav');
      const inner = el('div', 'topMenu');
      const width = el('div', 'width');
      const ul = el('ul', 'topMenuItems');
      width.append(ul); inner.append(width); nav.append(inner); host.append(nav);
      ul.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-sx-href]');
        if (!a) return;
        e.preventDefault();
        go(a.dataset.sxHref);
      });
    }
    const ul = nav.querySelector('ul');
    const sources = NAV_MAIN.map((href) => document.querySelector(`a.dashboard-item-wrapper[href="${href}"]`)).filter(Boolean).map((src) => {
      const badge = [...src.querySelectorAll('.notify, .mat-badge-content')].map((b) => b.textContent.trim()).find((t) => /^\d+$/.test(t) && t !== '0') || '';
      return { href: src.getAttribute('href'), title: (src.querySelector('.title') || src).textContent.trim(), badge };
    });
    const key = sources.map((x) => `${x.href}=${x.title}=${x.badge}`).join('|');
    if (ul.dataset.key === key) return;
    ul.dataset.key = key;
    const more = ul.querySelector(':scope > .sx-more');
    ul.replaceChildren(...sources.map(({ href, title, badge }) => {
      const li = el('li', 'topMenuItem');
      const a = el('a');
      a.href = href;
      a.dataset.sxHref = href;
      a.append(el('span', 'menu-text', title));
      if (badge) a.append(el('span', 'notify', badge));
      li.append(a);
      return li;
    }), ...(more ? [more] : []));
  };
  // User menu (the site's own dropdown under the name): "Profile" goes to personal data.
  const goPersonal = () => {
    const a = document.querySelector('.topMenuItem > a[href="/personal-data"]');
    if (a) a.click(); else location.assign('/personal-data');
  };
  const mountUserMenu = () => {
    const sub = document.querySelector('.user-subMenu');
    if (!sub || sub.dataset.sxBound) return;
    sub.dataset.sxBound = '1';
    for (const a of sub.querySelectorAll('a')) {
      const t = a.textContent.trim();
      if (/პროფილი/.test(t)) {
        a.dataset.en = 'Profile · პირადი მონაცემები';
        a.classList.add('sx-um-profile');
        // Capture on the link itself runs before the site's handler; replace its target.
        a.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          document.querySelector('.user-menu')?.click(); // close the dropdown the site's way
          goPersonal();
        }, true);
      } else if (/გასვლა/.test(t)) {
        a.dataset.en = 'Log out';
        a.classList.add('sx-um-logout');
      }
    }
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('.sx-more')) closeMore(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
  window.addEventListener('resize', closeMore);
  window.addEventListener('scroll', () => { const li = document.querySelector('.sx-more.sx-open'); if (li) placeMore(li); }, { passive: true });

  // ---------- Timetable page ----------
  // The site renders the week as .headInfo blocks (one per day, today = .now),
  // each lesson as a .day-item of "<b>label</b>: value<br>" pairs. We read those,
  // and add a clearer view next to them; the originals are hidden by CSS. Because
  // we read the site's own DOM, week navigation keeps working unchanged.
  const DAYS = [
    { ka: 'ორშაბათი', en: 'Monday', key: 'mon' },
    { ka: 'სამშაბათი', en: 'Tuesday', key: 'tue' },
    { ka: 'ოთხშაბათი', en: 'Wednesday', key: 'wed' },
    { ka: 'ხუთშაბათი', en: 'Thursday', key: 'thu' },
    { ka: 'პარასკევი', en: 'Friday', key: 'fri' },
    { ka: 'შაბათი', en: 'Saturday', key: 'sat' },
    { ka: 'კვირა', en: 'Sunday', key: 'sun' },
  ];
  const LESSON_LABELS = { 'საათი': 'time', 'სასწ.კურსი': 'course', 'ჯგუფი': 'group', 'ლექტორი': 'lecturer', 'აუდიტორია': 'room', 'ტიპი': 'type', 'ხანგრძლივობა': 'duration' };

  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const fromMin = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

  const parseLesson = (item) => {
    const out = {};
    let key = null, buf = '';
    const flush = () => { if (key) out[key] = buf.replace(/^\s*:\s*/, '').replace(/\s+/g, ' ').trim(); key = null; buf = ''; };
    for (const n of item.childNodes) {
      if (n.nodeName === 'B') { flush(); key = LESSON_LABELS[n.textContent.trim()] || n.textContent.trim(); }
      else if (n.nodeName === 'BR') flush();
      else buf += n.textContent;
    }
    flush();
    return out;
  };

  const buildLesson = (l) => {
    const start = toMin(l.time);
    const dur = parseInt(l.duration, 10);
    const box = el('div', 'sx-lesson');
    const top = el('div', 'sx-lesson-top');
    top.append(el('span', 'sx-time', l.time || '—'));
    if (start != null && dur > 0) top.append(el('span', 'sx-until', '– ' + fromMin(start + dur)));
    if (l.room) top.append(el('span', 'sx-room', l.room));
    box.append(top, el('div', 'sx-course', l.course || ''));
    if (l.lecturer) box.append(el('div', 'sx-lecturer', l.lecturer));
    const meta = [l.type, dur > 0 ? `${dur} წთ` : ''].filter(Boolean).join(' · ');
    if (meta) box.append(el('div', 'sx-meta', meta));
    box._sx = { start, end: start != null && dur > 0 ? start + dur : start };
    return box;
  };

  const enhanceWeek = () => {
    const heads = [...document.querySelectorAll('.weeklist-container > .headInfo')];
    if (!heads.length) return;
    const nowIdx = heads.findIndex((h) => h.classList.contains('now'));
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    heads.forEach((h, i) => {
      const ka = (h.querySelector('.day-name') || {}).textContent;
      const day = DAYS.find((d) => d.ka === (ka || '').trim()) || DAYS[i] || DAYS[0];
      const when = nowIdx < 0 ? 'week' : i < nowIdx ? 'past' : i === nowIdx ? 'today' : 'future';
      if (h.dataset.day !== day.key) h.dataset.day = day.key;
      if (h.dataset.when !== when) h.dataset.when = when;
      h.style.setProperty('--i', i);

      const label = h.querySelector('.day-title .mdc-button__label') || h.querySelector('.day-title');
      if (label && !label.querySelector('.sx-en')) {
        const chip = el('span', 'sx-today-chip', 'Today · დღეს');
        label.prepend(chip, el('span', 'sx-en', day.en));
      }

      const list = h.querySelector('.weeklist');
      if (!list) return;
      // Drop views whose source lesson changed or disappeared (e.g. after week navigation).
      for (const v of list.querySelectorAll(':scope > .sx-lesson')) {
        const src = v.previousElementSibling;
        if (!src || !src.classList.contains('day-item') || src.textContent !== v.dataset.src) v.remove();
      }
      const items = [...list.querySelectorAll(':scope > .day-item')];
      const views = items.map((item) => {
        let v = item.nextElementSibling;
        if (!v || !v.classList.contains('sx-lesson')) {
          v = buildLesson(parseLesson(item));
          v.dataset.src = item.textContent;
          item.after(v);
        }
        return v;
      });
      // Today: mark finished, live and next lessons.
      let nextMarked = false;
      for (const v of views) {
        let status = '';
        const t = v._sx || { start: toMin(v.querySelector('.sx-time').textContent), end: null };
        if (when === 'today' && t.start != null) {
          const end = t.end != null ? t.end : t.start;
          if (end <= nowMin) status = 'done';
          else if (t.start <= nowMin) { status = 'live'; nextMarked = true; }
          else if (!nextMarked) { status = 'next'; nextMarked = true; }
        }
        if (v.dataset.status !== status) {
          v.dataset.status = status;
          v.querySelector('.sx-status')?.remove();
          if (status === 'live') v.querySelector('.sx-lesson-top').append(el('span', 'sx-status', 'Now · ახლა'));
        }
      }
      const empty = list.querySelector(':scope > .sx-empty');
      if (!items.length && !empty) {
        const e = el('div', 'sx-empty');
        e.append(el('span', null, 'No classes'), el('span', null, 'თავისუფალი დღე'));
        list.append(e);
      } else if (items.length && empty) empty.remove();
    });
  };

  // Exam tabs: tag each row with its weekday colour and whether it is past.
  const enhanceExams = () => {
    const today = isoDate(new Date());
    for (const row of document.querySelectorAll('ac-tables-component mat-row')) {
      const wd = row.querySelector('.exam-weekday');
      const day = wd && DAYS.find((d) => d.ka === wd.textContent.trim());
      if (day && row.dataset.day !== day.key) { row.dataset.day = day.key; wd.dataset.en = day.en; }
      const dateNode = row.querySelector('.mat-column-day > div');
      const date = dateNode && /\d{4}-\d{2}-\d{2}/.exec(dateNode.textContent);
      const when = !date ? '' : date[0] < today ? 'past' : date[0] === today ? 'today' : 'future';
      if (row.dataset.when !== when) row.dataset.when = when;
    }
  };

  // Foldable left menu built from the site's own tab links (Angular keeps routing them).
  const RAIL_KEY = 'sx-rail';
  const TAB_EN = {
    '/tables/learningTables': 'Lectures',
    '/tables/ac-tables/1': 'Midterm',
    '/tables/ac-tables/2': 'Midterm retake',
    '/tables/ac-tables/3': 'Final',
    '/tables/ac-tables/4': 'Final retake',
    '/tables/ac-tables/quizzes': 'Quizzes',
  };
  const setRail = (open) => {
    root.classList.toggle('sx-rail-open', open);
    document.querySelector('.sx-rail-toggle')?.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(RAIL_KEY, open ? '1' : '0'); } catch { /* per-viewer convenience only */ }
  };
  const mountRail = () => {
    const menu = document.querySelector('.tables-dashboard');
    root.classList.toggle('sx-has-rail', !!menu);
    if (!menu) return;
    if (!menu.querySelector(':scope > .sx-rail-toggle')) {
      let stored = null;
      try { stored = localStorage.getItem(RAIL_KEY); } catch { /* ignore */ }
      const btn = el('button', 'sx-rail-toggle');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'მენიუ / Menu');
      btn.append(el('span', 'sx-burger'));
      btn.addEventListener('click', () => setRail(!root.classList.contains('sx-rail-open')));
      const head = el('div', 'sx-rail-head');
      head.append(el('span', 'sx-rail-title', 'ცხრილი'), el('span', 'sx-rail-sub', 'Schedule'));
      menu.prepend(btn, head);
      menu.addEventListener('click', (e) => {
        if (e.target.closest('.sx-rail-toggle')) return;
        if (!root.classList.contains('sx-rail-open')) { setRail(true); return; } // the whole folded strip opens it
        if (e.target.closest('.tables-tab-menu a') && window.innerWidth < 860) setRail(false);
      });
      document.addEventListener('click', (e) => {
        if (window.innerWidth >= 860 || !root.classList.contains('sx-rail-open')) return;
        if (e.target.closest('.tables-dashboard, .cdk-overlay-container')) return;
        setRail(false);
      });
      menu.append(el('span', 'sx-rail-hint')); // handle + chevron shown while folded
      setRail(stored != null ? stored === '1' : window.innerWidth > 1100);
    }
    // Semester and programme selectors of the lecture timetable live in the rail.
    let filters = menu.querySelector(':scope > .sx-rail-filters');
