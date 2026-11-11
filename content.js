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
