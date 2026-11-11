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

  // Exam tiles show only the running semester's periods: SEMESTER_STARTS bounds each window,
  // so an exam whose semester is over drops off instead of counting down to next year's date.
  const semesterWindow = () => {
    const starts = SEMESTER_STARTS.map(dayOf);
    const c = starts.filter((d) => d <= today0()).length; // semesters already begun
    const i = Math.max(0, Math.min(c - 1, starts.length - 1));
    return { lo: starts[i], hi: starts[i + 1] };
  };
  const currentPeriods = (periods) => {
    const { lo, hi } = semesterWindow();
    return periods.filter(([a]) => { const s = dayOf(a); return s >= lo && (!hi || s < hi); });
  };

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
    if (!filters) {
      filters = el('div', 'sx-rail-filters');
      filters.append(el('span', 'sx-rail-label', 'სემესტრი და პროგრამა'));
      menu.querySelector('.tables-tab-menu')?.after(filters);
    }
    // Only the selectors' own container (first block of the lecture timetable), never the month picker.
    const comp = document.querySelector('student-tables-component');
    const selectors = comp && comp.querySelector(':scope > div > div:first-child:has(> mat-form-field)');
    if (selectors) {
      selectors._sxHost = comp;
      // append() moves the node, which retriggers the MutationObserver: only when needed.
      if (selectors.parentElement !== filters) filters.append(selectors);
    }
    // Angular removes only the component, not nodes moved out of it: drop copies whose component is gone.
    for (const old of filters.querySelectorAll(':scope > div')) if (!old._sxHost || !old._sxHost.isConnected) old.remove();
    for (const a of menu.querySelectorAll('.tables-tab-menu a[href]')) {
      const en = TAB_EN[a.getAttribute('href')];
      if (en && a.dataset.en !== en) a.dataset.en = en;
    }
  };

  // ---------- Learning card ----------
  // Current (top) semester open, older ones folded behind their header.
  // Each course row gets a score bar; each header a short summary.
  const toggleSemester = (sem) => {
    const open = sem.dataset.sxFold !== 'open';
    sem.dataset.sxFold = open ? 'open' : 'closed';
    sem.querySelector('mat-header-row')?.setAttribute('aria-expanded', String(open));
  };
  // "You need X more points to pass (51)" under a score breakdown.
  const PASS = 51;
  const placeNeed = (host, totalText) => {
    const total = parseFloat(String(totalText || '').replace(',', '.'));
    let line = host.querySelector(':scope > .sx-need');
    if (Number.isNaN(total)) { line?.remove(); return; }
    const gap = Math.round((PASS - total) * 100) / 100;
    const text = gap > 0 ? `ჩასაბარებლად გაკლია ${gap} ქულა · ზღვარი ${PASS}` : `ზღვარი ${PASS} გადალახულია · +${-gap} ქულა`;
    if (!line) { line = el('div', 'sx-need'); host.append(line); }
    if (line.textContent !== text) line.textContent = text;
    line.classList.toggle('sx-passed', gap <= 0);
    if (host.lastElementChild !== line) host.append(line);
  };
  const tagDetailRows = () => {
    for (const d of document.querySelectorAll('.page-learningCard .result-detail')) {
      const name = d.querySelector('.result-detail-name');
      const val = d.querySelector('.result-detail-result');
      if (!name || !val) continue;
      const n = name.textContent.trim(), v = val.textContent.trim();
      const kind = !v ? 'sx-est-empty' : /^[\d.,]+$/.test(v) ? 'sx-num' : /არა?\s+არის\s+დაშვ/.test(v) ? 'sx-denied' : 'sx-text';
      for (const c of ['sx-est-empty', 'sx-num', 'sx-denied', 'sx-text']) d.classList.toggle(c, c === kind);
      d.classList.add('sx-est-row');
      d.classList.toggle('sx-total', n === 'ჯამი');
      d.classList.toggle('sx-grade', n === 'შედეგი');
      if (n === 'შედეგი' && d.dataset.grade !== v.toUpperCase()) d.dataset.grade = v.toUpperCase();
      name.classList.add('sx-est-name');
      val.classList.add('sx-est-val');
    }
    for (const wrap of document.querySelectorAll('.page-learningCard .result-detail-wrapper')) {
      const total = [...wrap.querySelectorAll('.result-detail.sx-total .result-detail-result')].map((v) => v.textContent.trim())[0];
      placeNeed(wrap, total);
    }
  };
  // End of the running semester = the next payment date the portal reports while that
  // semester is the newest one. Remembered per semester, so the date does not move on
  // when the portal later starts reporting the following payment.
  const semEnds = new Map(); // semester number -> Date | null (unknown) | undefined (not asked yet)
  const semesterEnded = (no) => {
    if (no == null) return false;
    if (semEnds.get(no) === undefined) {
      semEnds.set(no, null);
      const s = session();
      if (s) {
        const key = `sx-sem-end:${s.studentId}:${no}`;
        let stored = null;
        try { stored = localStorage.getItem(key); } catch { /* ignore */ }
        if (stored) semEnds.set(no, parseDate(stored));
        else {
          api(s, '/student/finances/paymentReminder').then((res) => {
            const date = parseDate(res && res.paymentDate);
            if (!date) return;
            semEnds.set(no, date);
            try { localStorage.setItem(key, res.paymentDate); } catch { /* still held for this page */ }
            schedule();
          }).catch(() => {});
        }
      }
    }
    const end = semEnds.get(no);
    return !!end && Date.now() >= end.getTime();
  };
  const enhanceCard = () => {
    tagDetailRows();
    // Overview tiles: mark the numeric value of each stat so it can be the big number.
    for (const sp of document.querySelectorAll('.page-learningCard .ini-block .last-stat h3 :is(span, b)')) {
      const isVal = /^\s*[\d.,]+\s*$/.test(sp.textContent);
      if (sp.classList.contains('sx-stat-val') !== isVal) sp.classList.toggle('sx-stat-val', isVal);
    }
    // Newest semester first: the site lists 5, 3, 4. Blocks without a semester number
    // (recognised courses, grouping by year) keep the site's order, after the numbered ones.
    const sems = [...document.querySelectorAll('.page-learningCard .semester-child')];
    const semNo = sems.map((sem) => {
      const m = /(\d+)\s*სემესტრი/.exec(sem.querySelector('mat-header-row .mat-column-bookName')?.textContent || '');
      return m ? +m[1] : null;
    });
    const numbered = semNo.filter((n) => n != null);
    const newest = numbered.length ? Math.max(...numbered) : null;
    const ended = semesterEnded(newest);
    const rank = sems.map((_, i) => i).sort((x, y) => (semNo[y] ?? -1) - (semNo[x] ?? -1) || x - y);
    sems.forEach((sem, i) => {
      const head = sem.querySelector('mat-header-row');
      if (!head) return;
      const current = newest != null ? semNo[i] === newest : i === 0;
      const order = String(2 + rank.indexOf(i));
      if (sem.style.order !== order) sem.style.order = order;
      if (!sem.dataset.sxFold) sem.dataset.sxFold = current ? 'open' : 'closed';
      if (!head.dataset.sxBound) {
        head.dataset.sxBound = '1';
        head.setAttribute('role', 'button');
        head.tabIndex = 0;
        head.setAttribute('aria-expanded', String(sem.dataset.sxFold === 'open'));
        head.addEventListener('click', (e) => { if (!e.target.closest('button, a')) toggleSemester(sem); });
        head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSemester(sem); } });
      }
      let credits = 0, count = 0;
      for (const row of sem.querySelectorAll('mat-row')) {
        // Desktop rows have one cell per column; on phones the site renders a single
        // .responsive-row cell: name + .icons-row [lecturer, credits, score, grade].
        let scoreCell, creditText;
        const rr = row.querySelector('.responsive-row');
        if (rr) {
          const [lect, credit, score, grade] = rr.querySelectorAll(':scope > .icons-row > div');
          lect?.classList.add('sx-m-lect'); credit?.classList.add('sx-m-credit');
          score?.classList.add('sx-m-score'); grade?.classList.add('sx-m-grade');
          scoreCell = score; creditText = credit?.textContent;
        } else {
          if (!row.querySelector('.mat-column-bookName')) continue;
          scoreCell = row.querySelector('.mat-column-score');
          creditText = row.querySelector('.mat-column-credit')?.textContent;
        }
        if (!scoreCell) continue;
        count++;
        credits += parseFloat(creditText) || 0;
        const score = Math.max(0, Math.min(100, parseFloat(scoreCell.textContent) || 0));
        const chip = row.querySelector('.result-color');
        let grade = (chip?.textContent || '').trim().toUpperCase();
        // A running course has no result yet: the site prints F until the points add up.
        // Once the semester has ended (next payment date reached), the F is real and shown.
        const running = current && !ended && score < PASS && (grade === 'F' || grade === '');
        if (running) grade = '';
        if (row.dataset.grade !== grade) row.dataset.grade = grade;
        if (row.hasAttribute('data-sx-running') !== running) {
          row.toggleAttribute('data-sx-running', running);
          if (running) { chip?.setAttribute('aria-label', 'მიმდინარე · In progress'); if (chip) chip.title = 'მიმდინარე · In progress'; }
          else { chip?.removeAttribute('aria-label'); chip?.removeAttribute('title'); }
        }
        let bar = scoreCell.querySelector(':scope > .sx-bar');
        if (!bar) { bar = el('span', 'sx-bar'); bar.append(el('i')); scoreCell.append(bar); }
        const w = `${score}%`;
        if (bar.firstChild.style.width !== w) bar.firstChild.style.width = w;
      }
      let sum = head.querySelector(':scope > .sx-sem-sum');
      if (!sum) {
        if (current) head.append(el('span', 'sx-sem-badge', 'მიმდინარე · Current'));
        sum = el('span', 'sx-sem-sum');
        head.append(sum, el('span', 'sx-chev'));
      }
      const text = `${count} საგანი · ${credits} კრედიტი`;
      if (sum.textContent !== text) sum.textContent = text;
    });
  };

  // ---------- Grade breakdown dialog (შეფასება) ----------
  // The site renders component names (rotated 90°) and values as two parallel rows.
  // We pair them into one list; the originals are hidden by CSS.
  const enhanceEstDialog = () => {
    for (const wrap of document.querySelectorAll('est-details-dialog .est-dialog-wrapper')) {
      const names = [...wrap.querySelectorAll('.est-items .est-component-name')].map((n) => n.textContent.trim());
      const values = [...wrap.querySelectorAll('.est-wrapper > .est-item')].map((v) => v.textContent.trim());
      if (!names.length) continue;
      const key = JSON.stringify([names, values]);
      let list = wrap.querySelector(':scope > .sx-est');
      if (list && list.dataset.key === key) continue;
      if (!list) { list = el('div', 'sx-est'); wrap.append(list); }
      list.dataset.key = key;
      list.replaceChildren(...names.map((name, i) => {
        const value = values[i] || '';
        const row = el('div', 'sx-est-row');
        if (!value) row.classList.add('sx-est-empty');
        else if (/^[\d.,]+$/.test(value)) row.classList.add('sx-num');
        else if (/არა?\s+არის\s+დაშვ/.test(value)) row.classList.add('sx-denied'); // "არ / არა არის დაშვებული"
        else row.classList.add('sx-text');
        if (/^ჯამი$/.test(name)) row.classList.add('sx-total');
        if (/^შედეგი$/.test(name)) { row.classList.add('sx-grade'); row.dataset.grade = value.toUpperCase(); }
        row.append(el('span', 'sx-est-name', name), el('span', 'sx-est-val', value || '—'));
        return row;
      }));
      placeNeed(list, values[names.indexOf('ჯამი')]);
    }
  };

  // ---------- Learning card header: grouping toggle labels + programme tooltip ----------
  const HEADER_VIEWS = { list: 'სემესტრებით · By semester', date_range: 'სასწავლო წლებით · By academic year' };
  const enhanceCardHeader = () => {
    const box = document.querySelector('.page-learningCard .semesters');
    if (!box) return;
    for (const btn of box.querySelectorAll('.semester-item.button button')) {
      const label = HEADER_VIEWS[(btn.querySelector('mat-icon')?.textContent || '').trim()];
      if (label && btn.getAttribute('aria-label') !== label) { btn.setAttribute('aria-label', label); btn.title = label; }
      const active = btn.classList.contains('mat-primary'); // the site marks the active grouping this way
      if (btn.getAttribute('aria-pressed') !== String(active)) btn.setAttribute('aria-pressed', String(active));
    }
    const select = box.querySelector('.semester-item:not(.button)');
    const value = select?.querySelector('.mat-mdc-select-value')?.textContent.trim();
    if (select && value && select.title !== value) select.title = value; // full name when the value is cut off
  };

  // ---------- Finances ----------
  // One summary card built from the site's own schedule rows (first panel = year total,
  // the rest = instalments). Amounts in the rows get a ₾ sign and a readable "remaining".
  const money = (n) => `${Math.round(n * 100) / 100} ₾`;
  const num = (t) => { const n = parseFloat(String(t || '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const enhanceFinances = () => {
    const page = document.querySelector('.page-finances');
    if (!page) return;
    const rows = [...page.querySelectorAll('mat-expansion-panel-header .wrapper-menu')].map((menu) => {
      const [labels, values] = menu.querySelectorAll(':scope > .wrapper-row');
      if (!labels || !values) return null;
      const first = [...labels.querySelectorAll(':scope > div:first-child span')].map((x) => x.textContent.trim());
      const cells = [...values.querySelectorAll(':scope > div')].slice(1);
      const due = num(cells[0]?.textContent), paid = num(cells[1]?.textContent) || 0;
      const left = due == null ? null : Math.max(0, due - paid);
      // Show: due, paid (0 when the site leaves it empty), remaining as a positive amount.
      [due, paid, left].forEach((v, i) => {
        const cell = cells[i];
        if (!cell) return;
        const show = v == null ? '—' : money(v);
        if (cell.dataset.sxV !== show) cell.dataset.sxV = show;
        cell.classList.toggle('sx-fin-due', i === 2 && v > 0);
      });
      const [d, m, y] = (/\d{2}\.\d{2}\.\d{4}/.exec(first[1] || '') || [''])[0].split('.').map(Number);
      return { name: first[0], dateText: first[1] || '', date: y ? new Date(y, m - 1, d) : null, due, paid, left };
    }).filter(Boolean);
    const total = rows.find((r) => !r.date);
    let card = page.querySelector(':scope > .sx-fin');
    if (!total || total.due == null) { card?.remove(); return; }
    const next = rows.filter((r) => r.date && r.left > 0).sort((x, y) => x.date - y.date)[0];
    const balance = [...page.querySelectorAll('.balance-wrapper .info-wrapper > div')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const days = next ? Math.round((next.date - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
    const key = JSON.stringify([total, next && [next.dateText, next.left], balance, days]);
    if (card && card.dataset.key === key) return;
    if (!card) { card = el('div', 'sx-fin'); page.querySelector('mat-tab-group')?.before(card); }
    card.dataset.key = key;
    const pct = total.due > 0 ? Math.max(0, Math.min(100, (total.paid / total.due) * 100)) : 0;
    const head = el('div', 'sx-fin-head');
    const big = el('div', 'sx-fin-paid');
    big.append(el('span', 'sx-fin-num', String(total.paid)), el('span', 'sx-fin-of', ` / ${money(total.due)}`));
    const paidBox = el('div', 'sx-fin-paidbox');
    paidBox.append(el('span', 'sx-fin-cap', 'გადახდილია · Paid'), big);
    head.append(paidBox);
    if (next) {
      // Countdown to the next instalment that still has something to pay.
      const cd = el('div', 'sx-fin-count' + (days < 0 ? ' sx-late' : ''));
      const n = el('div', 'sx-fin-count-n');
      n.append(el('span', 'sx-fin-count-num', String(Math.abs(days))), el('span', 'sx-fin-count-unit', 'დღე'));
      cd.append(
        el('span', 'sx-fin-cap', days < 0 ? 'გადახდის ვადა გასულია · Overdue' : 'გადახდამდე დარჩა · Until next payment'),
        n,
        el('span', 'sx-fin-sub', `${next.dateText} · ${money(next.left)}`),
      );
      head.append(cd);
    }
    const bar = el('div', 'sx-fin-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(total.due)); bar.setAttribute('aria-valuenow', String(total.paid));
    const fill = el('i'); fill.style.width = `${pct}%`; bar.append(fill);
    const facts = el('div', 'sx-fin-facts');
    const fact = (cap, val, sub, cls) => {
      const f = el('div', 'sx-fin-fact' + (cls ? ' ' + cls : ''));
      f.append(el('span', 'sx-fin-cap', cap), el('span', 'sx-fin-val', val));
      if (sub) f.append(el('span', 'sx-fin-sub', sub));
      return f;
    };
    facts.append(
      fact('დარჩენილია · Remaining', money(total.left), `${Math.round(pct)}% გადახდილია`),
      next
        ? fact('შემდეგი გადახდა · Next payment', next.dateText, `${money(next.left)} · ${days < 0 ? `ვადა გავიდა ${-days} დღის წინ` : days === 0 ? 'დღეს' : `${days} დღეში`}`, days < 0 ? 'sx-late' : '')
        : fact('შემდეგი გადახდა · Next payment', 'არ არის', 'ყველაფერი გადახდილია'),
    );
    for (const b of balance) { const [cap, val] = b.split(/:\s*/); facts.append(fact(cap, val || '')); }
    card.replaceChildren(head, bar, facts);
  };

  // ---------- Applications calendar (განცხადებები) ----------
  // The site draws a 7-column week table with one row per event, so each event gets a
  // ~100px column. We tag each event cell with its day; CSS turns the rows into a list.
  const enhanceCalendar = () => {
    const table = document.querySelector('hr-calendar-component .calendar table');
    if (!table) return;
    const days = [...table.querySelectorAll('thead th.headInfo')].map((th) => ({
      name: (th.querySelector('.day-name.desktop') || th.querySelector('.day-name'))?.textContent.trim() || '',
      number: th.querySelector('.day-number')?.textContent.trim() || '',
      now: th.classList.contains('now'),
    }));
    let events = 0;
    for (const tr of table.querySelectorAll('tbody tr')) {
      [...tr.querySelectorAll(':scope > td.week_tbody_td')].forEach((td, i) => {
        const has = !!td.querySelector('.event');
        if (has) events++;
        const label = has && days[i] ? `${days[i].name} ${days[i].number}` : '';
        if ((td.dataset.sxDay || '') !== label) { if (label) td.dataset.sxDay = label; else delete td.dataset.sxDay; }
        td.classList.toggle('sx-cal-today', has && !!days[i]?.now);
      });
    }
    const wrap = table.parentElement;
    let empty = wrap.querySelector(':scope > .sx-empty');
    if (!events && !empty) {
      empty = el('div', 'sx-empty');
      empty.append(el('span', null, 'ამ კვირაში ღონისძიება არ არის'), el('span', null, 'No events this week'));
      wrap.append(empty);
    } else if (events && empty) empty.remove();
  };

  // ---------- Academic registration ----------
  // Tags only: the student facts become label/value tiles, each course row gets its status
  // (passed / chosen / open) from the site's own icon. Nothing is clicked or submitted.
  const REG_FACTS = [[/^სემესტრი/, 'semester'], [/^GPA/, 'gpa'], [/^არჩეული კრედიტ/, 'credits']];
  const enhanceRegistration = () => {
    const page = document.querySelector('registration-routes-component');
    if (!page) return;
    for (const li of page.querySelectorAll('.student-info-card mat-list-item')) {
      const text = li.textContent.replace(/\s+/g, ' ').trim();
      const i = text.indexOf(':');
      if (i <= 0) continue;
      const k = text.slice(0, i).trim(), v = text.slice(i + 1).trim() || '—';
      if (li.dataset.sxK !== k) li.dataset.sxK = k;
      if (li.dataset.sxV !== v) li.dataset.sxV = v;
      const fact = (REG_FACTS.find(([re]) => re.test(k)) || [])[1] || '';
      if ((li.dataset.sxFact || '') !== fact) { if (fact) li.dataset.sxFact = fact; else delete li.dataset.sxFact; }
    }
    for (const row of page.querySelectorAll('.program-book-wrapper')) {
      const icons = [...row.querySelectorAll('.program-panel mat-icon')].map((x) => x.textContent.trim());
      const st = icons.includes('thumb_up') ? 'chosen' : icons.includes('done') ? 'done' : '';
      if (row.dataset.sxSt !== st) row.dataset.sxSt = st;
    }
  };

  // ---------- Timetable: loading state ----------
  // The week arrives a moment after the page: until the site's own request finishes,
  // show skeleton lessons instead of an empty week. Requests are seen through the
  // browser's resource timing (read-only); a click on week navigation starts a new wait.
  const TABLES_WAIT_MS = 6000;
  let tablesHost = null, tablesSince = 0, tablesDone = -1;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name.includes('/registration/getStudentTables')) tablesDone = Math.max(tablesDone, e.responseEnd);
      schedule();
    }).observe({ type: 'resource', buffered: true });
  } catch { /* no resource timing: the timeout below ends the skeleton */ }
  document.addEventListener('click', (e) => {
    if (e.target.closest('student-tables-component .calendar-navigation :is(button, a)')) { tablesSince = performance.now(); schedule(); }
  }, true);
  const enhanceTablesLoading = () => {
    const comp = document.querySelector('student-tables-component');
    if (comp !== tablesHost) { tablesHost = comp; tablesSince = performance.now(); }
    let loading = false;
    if (comp && !comp.querySelector('.day-item')) {
      const waited = performance.now() - tablesSince;
      loading = tablesDone < tablesSince - 1500 && waited < TABLES_WAIT_MS;
      if (loading) setTimeout(schedule, TABLES_WAIT_MS - waited + 50);
    }
    if (root.classList.contains('sx-tt-loading') !== loading) root.classList.toggle('sx-tt-loading', loading);
    // Before the site has drawn its day blocks there is nothing to put skeletons in: add our own row.
    const cal = comp && comp.querySelector('.calendar');
    const skel = comp && comp.querySelector('.sx-tt-skel');
    const need = loading && cal && !cal.querySelector('.weeklist-container > .headInfo');
    if (need && !skel) {
      const s = el('div', 'sx-tt-skel');
      s.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 7; i++) s.append(el('div', 'sx-tt-skel-day'));
      cal.append(s);
    } else if (!need && skel) skel.remove();
  };

  // ---------- Welcome screen after a fresh login ----------
  // Shown once, right after the user signs in through the login form in this tab.
  // A page refresh or a restored session (token already stored) never shows it.
  // Per-user "don't show again" lives in localStorage. Lives on <html> so it can
  // sit above the page; the site's own popups (browser top layer) are held back meanwhile.
  const FRESH_KEY = 'sx-fresh-login';
  const offKey = (s) => `sx-welcome-off:${s.studentId}`;
  const LOGIN_FORM = 'input[formcontrolname="password"], input[formcontrolname="username"]';
  let freshLogin = false;
  const noteLoginPage = () => {
    freshLogin = true;
    try { sessionStorage.setItem(FRESH_KEY, '1'); } catch { /* the in-memory flag still covers the SPA login */ }
  };
  const takeFreshLogin = () => {
    let fresh = freshLogin;
    try { fresh = fresh || sessionStorage.getItem(FRESH_KEY) === '1'; sessionStorage.removeItem(FRESH_KEY); } catch { /* ignore */ }
    freshLogin = false;
    return fresh;
  };

  const loadTodayLine = async (s) => {
    const group = await api(s, '/student/registration/group/getGroupForRegistration', {});
    if (!group || !group.selectedGroupId) return '';
    const res = await api(s, '/student/registration/getStudentTables', { studentId: s.studentId, eduId: s.eduId, groupId: group.selectedGroupId, dates: weekDates(0) });
    const now = new Date();
    const today = ((res && res.data) || [])[(now.getDay() + 6) % 7] || [];
    return todayLine(today.filter((e) => e?.data?.h != null).map((e) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), e.data.h, e.data.m || 0).getTime();
      return { start, end: start + (e.data.duration || 0) * 60000, name: e?.item?.book?.name };
    }));
  };

  const showWelcome = (s, firstName) => {
    const w = el('div', 'sx-welcome');
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    w.setAttribute('aria-labelledby', 'sx-w-title');
    const logo = el('div', 'sx-w-logo', 'Alte');
    logo.append(el('span', 'sx-w-x', 'X'));
    const title = el('h1', 'sx-w-title', 'კეთილი იყოს თქვენი მობრძანება AlteX პორტალზე');
    title.id = 'sx-w-title';
    const today = el('p', 'sx-w-today');
    const go = el('button', 'sx-w-go', 'გაგრძელება →');
    go.type = 'button';
    const off = el('label', 'sx-w-off');
    const box = el('input');
    box.type = 'checkbox';
    off.append(box, el('span', null, 'აღარ მაჩვენო'));
    const inner = el('div', 'sx-welcome-inner');
    inner.append(logo, title, el('p', 'sx-w-sub', 'Welcome to AlteX Portal'),
      el('p', 'sx-w-hello', firstName ? `გამარჯობა, ${firstName}` : 'გამარჯობა'), today, go, off);
    w.append(inner);

    root.classList.add('sx-welcoming');
    root.append(w);
    requestAnimationFrame(() => w.classList.add('sx-in'));
    go.focus({ preventScroll: true }); // Enter continues

    loadTodayLine(s).then((line) => { if (line) { today.textContent = line; today.classList.add('sx-show'); } }).catch(() => {});
    load(); // dashboard card data, so it is ready behind the screen

    let gone = false;
    go.addEventListener('click', () => {
      if (gone) return;
      gone = true;
      if (box.checked) { try { localStorage.setItem(offKey(s), '1'); } catch { /* per-viewer convenience */ } }
      w.classList.add('sx-out');
      setTimeout(() => {
        w.remove();
        root.classList.remove('sx-welcoming');
        root.classList.add('sx-enter'); // dashboard entrance: header → nav → cards
        setTimeout(() => root.classList.remove('sx-enter'), 1400);
      }, 320);
    });
  };

  const maybeWelcome = () => {
    if (document.querySelector(LOGIN_FORM)) { noteLoginPage(); return; }
    if (!document.querySelector('user-menu-component')) return; // not signed in yet
    if (!takeFreshLogin()) return;                               // refresh / restored session
    const s = session();
    if (!s) return;
    try { if (localStorage.getItem(offKey(s)) === '1') return; } catch { /* ignore */ }
    showWelcome(s, firstNameOf(s));
  };

  // ---------- Dashboard greeting ----------
  // Name, date, today's lectures (have / had) and the nearest exam period.
  const mountHello = () => {
    const cont = document.querySelector('dashboard-component .dashboard-item-container');
    let box = document.querySelector('.sx-hello');
    if (!cont) { box?.remove(); return; }
    const s = session();
    const now = new Date();
    const name = s ? firstNameOf(s) : '';
    const date = `${WEEKDAYS[(now.getDay() + 6) % 7]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    const line = knownLessons ? todayLine(knownLessons.filter((l) => isToday(l.start.getTime())).map((l) => ({ start: l.start.getTime(), end: l.end, name: l.course }))) : '';
    const exam = EXAMS.map((e) => ({ e, p: nextPeriod(currentPeriods(e.periods)) })).filter((x) => x.p).sort((x, y) => x.p.days - y.p.days)[0];
    const examText = !exam ? '' : exam.p.state === 'now' ? 'მიმდინარეობს' : daysWord(exam.p.days);
    const key = [name, date, line, exam && exam.e.key, examText].join('|');
    if (box && box.dataset.key === key && box.nextElementSibling === cont) return;
    if (!box) box = el('div', 'sx-hello');
    box.dataset.key = key;
    const text = el('div', 'sx-hello-text');
    text.append(el('span', 'sx-hello-date', date), el('h1', 'sx-hello-title', name ? `გამარჯობა, ${name}` : 'გამარჯობა'));
    if (line) text.append(el('p', 'sx-hello-line', line));
    box.replaceChildren(text);
    if (exam) {
      const chip = el('div', 'sx-hello-exam');
      chip.append(el('span', 'sx-hello-exam-cap', `${exam.e.ka} · ${exam.e.en}`), el('span', 'sx-hello-exam-val', examText), el('span', 'sx-hello-exam-sub', rangeText(exam.p.start, exam.p.end)));
      box.append(chip);
    }
    if (box.nextElementSibling !== cont) cont.before(box);
  };

  // ---------- Timetable: exam countdowns ----------
  // Three tiles above the week (midterm, midterm retake, final) and the next day off.
  const mountExamStrip = () => {
    const comp = document.querySelector('student-tables-component');
    if (!comp) return;
    const tiles = EXAMS.map((e) => ({ e, p: nextPeriod(currentPeriods(e.periods)) })).filter((x) => x.p).map(({ e, p }) => {
      if (p.state === 'now') return { e, big: 'ახლა', unit: '', sub: `${rangeText(p.start, p.end)} · ${p.left === 0 ? 'ბოლო დღე' : `დარჩა ${p.left} დღე`}`, pct: 100, state: 'now' };
      // Bar: how much of the wait since the semester began is already behind.
      const from = SEMESTER_STARTS.map(dayOf).filter((d) => d <= today0() && d < p.start).pop();
      const pct = from ? Math.max(0, Math.min(100, ((today0() - from) / (p.start - from)) * 100)) : 0;
      return { e, big: String(p.days), unit: 'დღე დარჩა', sub: `${rangeText(p.start, p.end)} ${p.start.getFullYear()}`, pct, state: 'soon' };
    });
    const off = nextPeriod(DAYS_OFF);
    const offDef = off && DAYS_OFF.find(([a]) => dayOf(a).getTime() === off.start.getTime());
    const key = JSON.stringify([tiles.map((t) => [t.big, t.sub, Math.round(t.pct)]), off && [off.state, off.days, off.start.getTime()]]);
    let strip = comp.querySelector(':scope > .sx-exams');
    if (strip && strip.dataset.key === key) { if (comp.firstElementChild !== strip) comp.prepend(strip); return; }
    if (!strip) { strip = el('section', 'sx-exams'); strip.setAttribute('aria-label', 'გამოცდებამდე დარჩენილი დრო · Exam countdowns'); }
    strip.dataset.key = key;
    const nearest = tiles.filter((t) => t.state !== 'none').sort((x, y) => (x.state === 'now' ? -1 : +x.big) - (y.state === 'now' ? -1 : +y.big))[0];
    strip.replaceChildren(...tiles.map((t) => {
      const tile = el('div', 'sx-exam');
      tile.dataset.exam = t.e.key;
      tile.dataset.state = t.state;
      if (t === nearest) tile.dataset.next = '1';
      const head = el('div', 'sx-exam-head');
      head.append(el('span', 'sx-exam-ka', t.e.ka), el('span', 'sx-exam-en', t.e.en));
      const count = el('div', 'sx-exam-count');
      count.append(el('span', 'sx-exam-num', t.big));
      if (t.unit) count.append(el('span', 'sx-exam-unit', t.unit));
      const bar = el('div', 'sx-exam-bar');
      const fill = el('i'); fill.style.width = `${t.pct}%`; bar.append(fill);
      tile.append(head, count, bar, el('span', 'sx-exam-sub', t.sub));
      return tile;
    }));
    if (off && offDef) {
      const tile = el('div', 'sx-exam sx-exam-off');
      const head = el('div', 'sx-exam-head');
      head.append(el('span', 'sx-exam-ka', 'შემდეგი დასვენების დღე'), el('span', 'sx-exam-en', 'Next day off'));
      const name = el('div', 'sx-exam-offname', offDef[2]);
      tile.append(head, name, el('span', 'sx-exam-sub', `${offDef[3]} · ${rangeText(off.start, off.end)} · ${off.state === 'now' ? 'დღეს' : daysWord(off.days)}`));
      strip.append(tile);
    }
    if (comp.firstElementChild !== strip) comp.prepend(strip);
  };

  // ---------- Assignments page ----------
  // Each course row gets a fold with its five latest assignments (read-only, same endpoints
  // as the portal's own task pages). The row's "info" button still opens the full list.
  const TASKS_SHOWN = 5;
  const taskItem = (t) => {
    const item = el('div', 'sx-tf-item');
    const meta = el('div', 'sx-tf-meta');
    if (t.posted) meta.append(el('span', 'sx-tf-date', `დაემატა ${dmy(t.posted)} · ${agoText(t.posted)}`));
    if (t.end) {
      const due = el('span', 'sx-tf-due', `ვადა ${dmy(t.end)} ${hm(t.end)}`);
      if (t.end.getTime() < Date.now()) due.classList.add('sx-past');
      meta.append(due);
    }
    const files = (t.files || []).length;
    if (files) meta.append(el('span', 'sx-tf-files', `${files} ფაილი`));
    item.append(el('div', 'sx-tf-name', t.name || 'დავალება'), meta);
    // The portal stores the text as HTML (tags, numeric entities): read it as plain text, never insert it as markup.
    const text = (new DOMParser().parseFromString(String(t.text || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^https?:\/\/\S+$/.test(text)) {
      const a = el('a', 'sx-tf-link', 'ბმულის გახსნა ↗');
      a.href = text; a.target = '_blank'; a.rel = 'noopener noreferrer';
      item.append(a);
    } else if (text) item.append(el('p', 'sx-tf-text', text));
    return item;
  };
  let taskBookMap = null; // row id -> course, once loaded
  const enhanceTasks = () => {
    const page = document.querySelector('tasks-mini-component');
    if (!page) return;
    const s = session();
    if (!s) return;
    if (!taskBookMap) {
      taskBooks(s).then((list) => { taskBookMap = new Map(list.map((b) => [String(b.id), b])); schedule(); }).catch(() => {});
      return;
    }
    for (const row of page.querySelectorAll('mat-row')) {
      const id = row.querySelector('.mat-column-id')?.textContent.trim();
      const book = taskBookMap.get(id);
      let fold = row.querySelector(':scope > .sx-tf');
      if (fold && fold.dataset.id !== id) { fold.remove(); fold = null; }
      if (!book || fold) continue;
      fold = el('details', 'sx-tf');
      fold.dataset.id = id;
      const summary = el('summary', 'sx-tf-sum');
      const count = el('span', 'sx-tf-count', '…');
      summary.append(el('span', 'sx-tf-label', 'ბოლო დავალებები'), el('span', 'sx-tf-en', 'Latest assignments'), count, el('span', 'sx-chev'));
      const list = el('div', 'sx-tf-list');
      fold.append(summary, list);
      row.append(fold);
      courseTasks(s, book.listId).then((tasks) => {
        const shown = tasks.slice(0, TASKS_SHOWN);
        count.textContent = String(shown.length);
        fold.classList.toggle('sx-tf-none', !shown.length);
        if (shown.length) list.replaceChildren(...shown.map(taskItem));
        else list.replaceChildren(el('p', 'sx-tf-empty', 'ამ საგანში დავალება ჯერ არ დადებულა · No assignments posted yet'));
      }).catch(() => {
        count.textContent = '!';
        list.replaceChildren(el('p', 'sx-tf-empty', 'დავალებები ვერ ჩაიტვირთა · Could not load assignments'));
      });
    }
  };

  // ---------- Login page ----------
  // Brand panel beside the form: the wordmark and a small animated week, the thing the
  // portal is opened for. Decorative only; the form itself is the site's own.
  const LOGIN_WEEK = [ // per weekday: [top %, height %] of each lesson block
    [[6, 22], [44, 26]],
    [[18, 30], [64, 20]],
    [[4, 18], [34, 22], [70, 22]],
    [[26, 28]],
    [[10, 24], [52, 30]],
  ];
  const mountLogin = () => {
    const page = document.querySelector('login-component');
    if (root.classList.contains('sx-login') !== !!page) root.classList.toggle('sx-login', !!page);
    if (!page || page.querySelector(':scope > .sx-login-art')) return;
    const art = el('div', 'sx-login-art');
    art.setAttribute('aria-hidden', 'true');
    const brand = el('div', 'sx-la-brand', 'Alte');
    brand.append(el('span', 'sx-la-x', 'X'));
    const week = el('div', 'sx-la-week');
    ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ'].forEach((day, i) => {
      const col = el('div', 'sx-la-col');
      col.append(el('span', 'sx-la-day', day));
      const track = el('div', 'sx-la-track');
      for (const [top, height] of LOGIN_WEEK[i]) {
        const b = el('i', 'sx-la-block');
        b.style.top = `${top}%`; b.style.height = `${height}%`;
        b.style.setProperty('--at', String(top / 100)); // lights up when the time line reaches it
        track.append(b);
      }
      col.append(track);
      week.append(col);
    });
    week.append(el('span', 'sx-la-now'));
    const copy = el('div', 'sx-la-copy');
    copy.append(el('p', 'sx-la-title', 'შენი სემესტრი — ერთ ეკრანზე.'), el('p', 'sx-la-sub', 'ლექციები, შეფასებები, დავალებები და გამოცდები. Lectures, grades, assignments and exams in one place.'));
    art.append(brand, week, copy);
    page.prepend(art);
  };

  // ---------- loop ----------
  let queued = false, lastRun = 0;
  const run = () => {
    queued = false;
    lastRun = performance.now();
    // Page-kind flags for CSS: :has() on <html> rescans the whole DOM on every style recalc.
    for (const [cls, sel] of [['sx-dash', 'dashboard-component'], ['sx-tables', 'student-tables-component'], ['sx-ttdash', 'tables-dashboard-component'], ['sx-program', 'program-view']]) {
      root.classList.toggle(cls, !!document.querySelector(sel));
    }
    tagZeroCounts();
    mountIdc();
    mountUserMenu();
    mountDashNav();
    mountNav();
    mountRail();
    enhanceWeek();
    enhanceExams();
    enhanceCard();
    enhanceEstDialog();
    enhanceCardHeader();
    enhanceFinances();
    enhanceCalendar();
    enhanceTablesLoading();
    enhanceRegistration();
    enhanceTasks();
    mountExamStrip();
    mountHello();
    mountLogin();
    goStatementList();
    maybeWelcome();
    if (document.querySelector('a.dashboard-item-wrapper[href="/learningCard"]')) { render(); load(); }
  };
  // The portal mutates the DOM constantly; each pass scans the whole document, so cap it at ~5/second.
  const schedule = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { if (document.hidden) { queued = false; return; } run(); }, Math.max(0, 200 - (performance.now() - lastRun)));
  };

  const start = () => {
    run();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(schedule, 60 * 1000); // keeps Now / Next on the timetable current
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
