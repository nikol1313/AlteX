'use strict';
const CACHE_MS = 5 * 60 * 1000;

const untilText = (ms) => {
  const min = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (min < 1) return 'ახლა';
  if (min < 60) return `${min} წთ-ში`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} სთ ${min % 60} წთ-ში`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'ხვალ' : `${days} დღეში`;
};
const dayLabel = (date) => {
  const diff = daysUntil(date);
  return diff === 0 ? 'დღეს' : diff === 1 ? 'ხვალ' : WEEKDAYS[weekdayOf(date)];
};
const agoText = (date) => {
  const days = -daysUntil(date);
  return days <= 0 ? 'დღეს' : days === 1 ? 'გუშინ' : `${days} დღის წინ`;
};

// "You have / had today": past tense once every lecture of the day has ended.
const todayLine = (lessons) => {
  const list = [...lessons].sort((x, y) => x.start - y.start);
  if (!list.length) return 'დღეს ლექციები არ გაქვს';
  const left = list.filter((l) => l.end > Date.now());
  const label = (l) => `${l.name || 'ლექცია'}, ${hm(new Date(l.start))}`;
  if (!left.length) return list.length === 1 ? `დღეს გქონდა 1 ლექცია: ${label(list[0])}` : `დღეს გქონდა ${list.length} ლექცია · ყველა დასრულდა`;
  if (left.length < list.length) return `დღეს გაქვს კიდევ ${left.length} ლექცია · შემდეგი: ${label(left[0])}`;
  return list.length === 1 ? `დღეს გაქვს 1 ლექცია: ${label(list[0])}` : `დღეს გაქვს ${list.length} ლექცია · პირველი: ${label(list[0])}`;
};
const todayLessonsLine = () => {
  const shown = current();
  const lessons = shown && shown.data['/tables'] && shown.data['/tables'].lessons;
  return lessons ? todayLine(lessons.filter((l) => isToday(l.start)).map((l) => ({ start: l.start, end: l.end, name: l.course }))) : '';
};

// Each loader returns plain data (saved for the next visit); its view turns it into the card at render time,
// so countdowns stay current.
// The portal gives grades without dates: the last seen scores are remembered and a changed one is the new grade.
const NO_GRADE = { lines: ['ახალი შეფასება ჯერ არ დადებულა'], caption: 'No new grades have been posted yet', empty: true };
const loadCard = async (s) => {
  const res = await api(s, '/student/card');
  const books = ((res && res.card && res.card.books) || []).filter((b) => b && b.id != null && typeof b.score === 'number');
  if (!books.length) return null;
  const key = `sx-grades:${s.studentId}`;
  let stored = null;
  try { stored = JSON.parse(store.get(key)); } catch { /* start over */ }
  let last = (stored && stored.last) || null;
  if (stored && stored.scores) {
    const changed = books
      .filter((b) => (b.id in stored.scores ? stored.scores[b.id] !== b.score : b.score > 0))
      .sort((x, y) => (Number(y.semester) || 0) - (Number(x.semester) || 0));
    if (changed.length) {
      const b = changed[0];
      const delta = Math.round((b.score - (stored.scores[b.id] || 0)) * 100) / 100;
      last = { name: b.name, score: b.score, delta, at: Date.now() };
    }
  }
  const scores = {};
  for (const b of books) scores[b.id] = b.score;
  store.set(key, JSON.stringify({ scores, last }));
  return { last };
};
const viewCard = ({ last }) => {
  if (!last) return NO_GRADE;
  const change = last.delta > 0 ? `+${last.delta} ქულა` : last.delta < 0 ? `${last.delta} ქულა` : '';
  return {
    lines: [`${last.score} / 100`, last.name, [change, dmy(new Date(last.at))].filter(Boolean).join(' · ')],
    caption: 'ბოლო შეფასება · Latest grade',
  };
};

const KINDS = { lecture: 'ლექცია', seminar: 'სემინარი', lab: 'ლაბი', laboratory: 'ლაბი', practice: 'პრაქტიკა' };
// activity_type ("lecture_seminar") names the whole format; type alone is just the slot ("seminar").
const kindOf = (d) => [...new Set(String(d.activity_type || d.type || '').toLowerCase().split(/[_\s,]+/).map((k) => KINDS[k]).filter(Boolean))].join(' / ');

// Live: how far into the lecture. Upcoming: how much of the wait since the previous lecture (at most a day) has passed.
const countdownShare = (lessons, next, now) => {
  const start = next.start.getTime();
  const prevEnd = Math.max(start - 86400000, ...lessons.filter((l) => l.end <= start).map((l) => l.end));
  const share = start <= now ? (now - start) / Math.max(1, next.end - start) : (now - prevEnd) / Math.max(1, start - prevEnd);
  // Rounded so the card (keyed on its content) is rebuilt every few minutes, not on every pass.
  return Math.round(Math.min(1, Math.max(0, share)) * 200) / 200;
};

// Monday..Saturday of the week holding the next lecture, with a lecture count per day.
const weekStrip = (lessons, around) => {
  const monday = new Date(around.getFullYear(), around.getMonth(), around.getDate() - weekdayOf(around));
  return DAYS.slice(0, 6).map((day, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const diff = daysUntil(d);
    return { key: day.key, ka: day.ka, short: day.ka.slice(0, 3), iso: isoDate(d), n: lessons.filter((l) => isoDate(l.start) === isoDate(d)).length, today: diff === 0, past: diff < 0 };
  });
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
          prof: personName(d.profName), kind: kindOf(d),
        });
      }
    });
    if (lessons.some((l) => l.end > Date.now())) break;
  }
  lessons.sort((x, y) => x.start - y.start);
  return { lessons: lessons.map((l) => ({ ...l, start: l.start.getTime() })) };
};
const viewNextLecture = (data) => {
  const lessons = data.lessons.map((l) => ({ ...l, start: new Date(l.start) }));
  const now = Date.now();
  const next = lessons.find((l) => l.end > now);
  if (!next) return { lines: ['ლექციები არ არის'], caption: 'ამ და მომდევნო კვირაში', empty: true };
  const start = next.start.getTime();
  const live = start <= now;
  const free = !live && daysUntil(next.start) >= 2;
  const span = `${hm(next.start)}–${hm(new Date(next.end))}`;
  const lines = free
    ? [{ text: 'ხვალ თავისუფალი ხარ 🎉', cls: 'sx-val sx-lec-free' }, { text: `შემდეგი: ${dayLabel(next.start)}, ${hm(next.start)}`, cls: 'sx-val sx-lec-next' }]
    : [live ? 'მიმდინარეობს ახლა' : untilText(start), { bar: countdownShare(lessons, next, now) }];
  if (next.course) lines.push({ text: next.course, cls: 'sx-val sx-lec-course' });
  const when = live ? `დღეს, ${span}` : `${dayLabel(next.start)}, ${span}`;
  lines.push(next.room ? `${when} · აუდიტორია ${next.room}` : when);
  const who = [next.prof, next.kind].filter(Boolean).join(' · ');
  if (who) lines.push({ text: who, cls: 'sx-val sx-lec-who' });
  lines.push({ week: weekStrip(lessons, next.start) });
  return { lines, caption: live ? 'მიმდინარე ლექცია' : 'შემდეგი ლექცია' };
};

const taskCache = new Map();
const courseTasks = (s, listId) => {
  if (!taskCache.has(listId)) {
    const p = api(s, '/student/tasks/?page=1&limit=10', { listId }).then((r) => ((r && r.data) || [])
      .map((t) => ({ ...t, posted: parseDate(t.created_at), end: parseDate(t.endDate) }))
      .sort((x, y) => (y.posted || 0) - (x.posted || 0)));
    p.catch(() => taskCache.delete(listId));
    taskCache.set(listId, p);
  }
  return taskCache.get(listId);
};
let taskBooksCache = null;
const taskBooks = (s) => {
  if (!taskBooksCache) {
    taskBooksCache = api(s, '/student/getStudentTaskBooks/?page=1&limit=10', { registrationGroupId: '' }).then((r) => (r && r.data) || []);
    taskBooksCache.catch(() => { taskBooksCache = null; });
  }
  return taskBooksCache;
};
const personName = (v) => {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') return ([v.firstName, v.lastName].filter(Boolean).join(' ') || String(v.name || v.fullName || '')).trim();
  return '';
};
const lecturerOf = (t, book) => {
  for (const src of [t, book]) {
    for (const k of ['lecturer', 'lecturerName', 'teacher', 'teacherName', 'professor', 'user', 'userName', 'creator', 'author', 'owner']) {
      const n = personName(src && src[k]);
      if (n && !/^\d+$/.test(n)) return n;
    }
  }
  return '';
};

const NO_TASK = { lines: ['ახალი დავალება ჯერ არ დადებულა'], caption: 'No new assignments have been posted yet', empty: true };
const loadTasks = async (s) => {
  const list = await taskBooks(s);
  const perBook = await Promise.allSettled(list.map((b) => courseTasks(s, b.listId)));
  const all = [];
  perBook.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const t of r.value) if (t.posted) all.push({ ...t, course: list[i].name, lecturer: lecturerOf(t, list[i]) });
  });
  all.sort((x, y) => y.posted - x.posted);
  const latest = all[0];
  return { latest: latest && { name: latest.name, text: latest.text, course: latest.course, lecturer: latest.lecturer, posted: +latest.posted, end: latest.end ? +latest.end : null } };
};
const viewTasks = (data) => {
  const l = data.latest;
  const latest = l && { ...l, posted: new Date(l.posted), end: l.end ? new Date(l.end) : null };
  if (!latest) return NO_TASK;
  const text = plainText(latest.text);
  const msg = text && !/^https?:\/\/\S+$/.test(text) ? text : '';
  const meta = [
    latest.posted ? `დაემატა: ${agoText(latest.posted)} - ${dmy(latest.posted)}` : '',
    latest.end ? `ვადა: ${dmy(latest.end)} ${hm(latest.end)}` : '',
  ].filter(Boolean).join(' · ');
  const inner = [
    latest.name && { text: latest.name, cls: 'sx-task-title' },
    msg && { text: msg, cls: 'sx-task-desc' },
  ].filter(Boolean);
  const lines = [
    latest.lecturer && { text: `ლექტორი: ${latest.lecturer}:`, cls: 'sx-who' },
    latest.course && { text: latest.course, cls: 'sx-course' },
    inner.length && { box: inner },
    meta && { text: meta, cls: 'sx-task-meta' },
  ].filter(Boolean);
  return { lines, caption: 'ბოლო დავალება · Latest assignment' };
};

const SECTIONS = {
  '/tables': { load: loadNextLecture, view: viewNextLecture },
  '/tasks-books': { load: loadTasks, view: viewTasks },
  '/learningCard': { load: loadCard, view: viewCard },
};
const FALLBACK = () => ({ lines: [], caption: 'გახსენით სანახავად' });
let cache = null;
let loading = null;
let lastTry = { token: null, at: 0 };

// The cards open with the last visit's data (stale-while-revalidate): they are filled in the dashboard's first
// frame instead of growing when the API answers, which was the page's largest layout shift and held back LCP.
// Kept per student; a week at most; forgotten on log out.
const SAVED_MS = 7 * 24 * 3600 * 1000;
const savedKey = (s) => `sx-dash:${s.studentId}`;
const restore = (s) => {
  try {
    const saved = JSON.parse(store.get(savedKey(s)));
    if (saved && saved.data && Date.now() - saved.at < SAVED_MS) return { at: saved.at, token: null, studentId: s.studentId, data: saved.data };
  } catch { /* nothing saved */ }
  return null;
};
// The data on screen for the signed-in student: restored on first use, so the greeting and cards drawn in the
// same pass (before load() runs) already have it.
const current = () => {
  const s = session();
  if (!s || !s.eduId) return null;
  if (!cache || cache.studentId !== s.studentId) cache = restore(s);
  return cache;
};
const forgetDashboard = () => { const s = session(); if (s) store.remove(savedKey(s)); cache = null; };

// Fresh for five minutes per login token: data fetched before signing in (no token, or an expired one) never sticks.
const load = () => {
  const s = session();
  if (!s || !s.eduId) { if (cache) { cache = null; render(); } return Promise.resolve(); }
  current();
  if (cache && cache.token === s.token && Date.now() - cache.at < CACHE_MS) return Promise.resolve();
  if (loading) return loading;
  if (lastTry.token === s.token && Date.now() - lastTry.at < 30000) return Promise.resolve();
  if (lastTry.token !== s.token) { taskBooksCache = null; taskCache.clear(); }
  lastTry = { token: s.token, at: Date.now() };
  const hrefs = Object.keys(SECTIONS);
  loading = Promise.allSettled(hrefs.map((h) => SECTIONS[h].load(s))).then((settled) => {
    const data = {};
    settled.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) data[hrefs[i]] = r.value; });
    // Nothing came back (e.g. the token was refused): keep what is shown and try again later instead of caching emptiness.
    if (Object.keys(data).length) {
      cache = { at: Date.now(), token: s.token, studentId: s.studentId, data };
      store.set(savedKey(s), JSON.stringify({ at: cache.at, data }));
    }
    loading = null;
    render();
  });
  return loading;
};

const barNode = (share) => {
  const bar = el('span', 'sx-lec-bar');
  bar.append(el('i'));
  bar.style.setProperty('--p', share.toFixed(3));
  return bar;
};
const weekNode = (days) => {
  const max = Math.max(3, ...days.map((d) => d.n));
  const strip = el('span', 'sx-wk');
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', days.map((d) => `${d.ka}: ${d.n}`).join(', '));
  for (const d of days) {
    const day = el('span', 'sx-wk-day');
    day.dataset.iso = d.iso;
    if (d.today) day.dataset.today = '';
    if (d.past) day.dataset.past = '';
    if (!d.n) day.dataset.off = '';
    const bar = el('span', 'sx-wk-bar');
    bar.style.setProperty('--h', (d.n / max).toFixed(3));
    day.append(el('span', 'sx-wk-n', d.n ? String(d.n) : '·'), bar, el('span', 'sx-wk-lbl', d.short));
    strip.append(day);
  }
  return strip;
};
const lineNode = (t) => {
  if (t && t.bar != null) return barNode(t.bar);
  if (t && t.week) return weekNode(t.week);
  if (t && t.box) {
    const w = el('div', 'sx-taskbox');
    w.append(...t.box.map((b) => el('span', b.cls || 'sx-val', b.text)));
    return w;
  }
  return typeof t === 'string' ? el('span', 'sx-val', t) : el('span', t.cls || 'sx-val', t.text);
};
const render = () => {
  for (const href of Object.keys(SECTIONS)) {
    const item = document.querySelector(`a.dashboard-item-wrapper[href="${href}"] .dashboard-item`);
    if (!item) continue;
    const shown = current();
    const result = shown ? (href in shown.data ? SECTIONS[href].view(shown.data[href]) : FALLBACK()) : null;
    const key = result ? JSON.stringify(result) : '';
    let box = item.querySelector(':scope > .sx-data');
    if (box && box.dataset.key === key) continue;
    if (!result) { box?.remove(); continue; }
    if (!box) { box = el('div', 'sx-data'); item.append(box); }
    box.dataset.key = key;
    box.classList.toggle('sx-none', !!result.empty);
    box.replaceChildren(...result.lines.map(lineNode), el('span', 'sx-cap', result.caption));
  }
};

// Greeting above the boxes: name, date, today's lectures and the nearest exam period.
const mountHello = () => {
  const cont = document.querySelector('dashboard-component .dashboard-item-container');
  let box = document.querySelector('.sx-hello');
  if (!cont) { box?.remove(); return; }
  const s = session();
  const now = new Date();
  const name = s ? s.firstName : '';
  const date = `${WEEKDAYS[weekdayOf(now)]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const line = todayLessonsLine();
  const exam = upcomingExams().sort((x, y) => x.p.days - y.p.days)[0];
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
  // Lets phones lay greeting, boxes and the exam countdown out as one column (dashboard.css).
  if (!cont.parentElement.classList.contains('sx-dash-stack')) cont.parentElement.classList.add('sx-dash-stack');
};

// A day in the week strip opens the timetable at that day (timetable.js scrolls to it).
let pendingTTDay = null;
document.addEventListener('click', (e) => {
  const day = e.target.closest && e.target.closest('a.dashboard-item-wrapper[href="/tables"] .sx-wk-day');
  pendingTTDay = day ? { iso: day.dataset.iso, at: Date.now() } : null;
}, true);
