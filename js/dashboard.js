'use strict';
const CACHE_MS = 5 * 60 * 1000;

const untilText = (ms) => {
  const min = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (min < 1) return 'ახლა';
  return min < 60 ? `${min} წთ-ში` : `${Math.floor(min / 60)} სთ ${min % 60} წთ-ში`;
};
const dayLabel = (date) => {
  const diff = daysUntil(date);
  return diff === 0 ? 'დღეს' : diff === 1 ? 'ხვალ' : WEEKDAYS[weekdayOf(date)];
};
const agoText = (date) => {
  const days = -daysUntil(date);
  return days <= 0 ? 'დღეს' : days === 1 ? 'გუშინ' : `${days} დღის წინ`;
};

// "You have today": nothing once every lecture of the day has ended.
const todayLine = (lessons) => {
  const list = [...lessons].sort((x, y) => x.start - y.start);
  if (!list.length) return 'დღეს ლექციები არ გაქვს';
  const left = list.filter((l) => l.end > Date.now());
  const label = (l) => `${l.course || 'ლექცია'}, ${hm(new Date(l.start))}`;
  if (!left.length) return '';
  if (left.length < list.length) return `დღეს გაქვს კიდევ ${left.length} ლექცია · შემდეგი: ${label(left[0])}`;
  return list.length === 1 ? `დღეს გაქვს 1 ლექცია: ${label(list[0])}` : `დღეს გაქვს ${list.length} ლექცია · პირველი: ${label(list[0])}`;
};
const todayLessonsLine = () => {
  const shown = current();
  const lessons = shown && shown.data['/tables'] && shown.data['/tables'].lessons;
  return lessons ? todayLine(lessons.filter((l) => isToday(l.start))) : '';
};

// Each loader returns plain data (saved for the next visit); its view turns it into the card at render time,
// so countdowns stay current.
// The portal's card gives only each subject's total: the last seen totals are remembered and a changed one is the
// subject with the new grade. Which grade it was comes from the subject's breakdown (getCardDetails): its parts are
// remembered too, and the part that changed is the grade the lecturer just entered (not the whole total).
// Only one grade is ever shown. The portal dates the subject, not its parts: when several are new at once
// (nothing remembered yet, or two grades between visits) the smallest is taken, quizzes and homework being
// entered far more often than exams.
const NO_GRADE = { lines: ['ახალი შეფასება ჯერ არ დადებულა'], caption: 'No new grades have been posted yet', empty: true };
const round2 = (n) => Math.round(n * 100) / 100;
const gradeParts = (rows) => {
  const parts = {};
  let at = 0;
  for (const c of rows || []) {
    if (!c || c.componentType !== 1) continue;
    const names = (c.data && c.data.items) || [];
    const items = (c.items || []).length ? c.items : [{ key: '', value: c.result }];
    for (const it of items) {
      const v = parseFloat(String(it.value).replace(',', '.'));
      if (Number.isNaN(v)) continue;
      parts[`${c.coId}:${it.key}`] = { v, name: (names[it.key] && names[it.key].name) || c.name || '' };
      at = Math.max(at, +parseDate(c.updated_at) || 0);
    }
  }
  return { parts, at };
};
const onePart = (list) => [...(list || [])].sort((x, y) => Math.abs(x.d) - Math.abs(y.d)).slice(0, 1);
// Without remembered parts (first look at a subject) the part equal to the total's change is the new one.
const newParts = (now, before, delta) => {
  const list = Object.entries(now).map(([k, p]) => ({ name: p.name, d: round2(p.v - ((before && before[k] && before[k].v) || 0)) })).filter((p) => p.d);
  const exact = before ? [] : list.filter((p) => p.d === delta);
  return onePart(exact.length ? exact : list);
};
const loadCard = async (s) => {
  const books = await cardBooks(s);
  if (!books.length) return null;
  const key = `sx-grades:${s.studentId}`;
  let stored = null;
  try { stored = JSON.parse(store.get(key)); } catch { /* start over */ }
  let last = (stored && stored.last) || null;
  const parts = (stored && stored.parts) || {};
  // v2: totals now add up every graded part. Older saved totals were the portal's short ones, so the first look
  // takes the new totals as they are, and drops a latest grade that came from a corrected subject's short total.
  if (stored && stored.v !== 2) {
    const was = last && books.find((x) => x.id === last.id);
    if (was && was.printed != null) last = null;
  } else if (stored && stored.scores) {
    const changed = books
      .filter((b) => (b.id in stored.scores ? stored.scores[b.id] !== b.score : b.score > 0))
      .sort((x, y) => (Number(y.semester) || 0) - (Number(x.semester) || 0));
    if (changed.length) {
      const b = changed[0];
      last = { id: b.id, name: b.name, score: b.score, delta: round2(b.score - (stored.scores[b.id] || 0)), at: Date.now() };
    }
  }
  // Also fills in a grade saved before parts were tracked. A failed call leaves it without parts: retried next time.
  const book = last && books.find((x) => (last.id != null ? x.id === last.id : x.name === last.name && x.score === last.score));
  if (book && !last.parts) {
    try {
      const detail = gradeParts((await api(s, '/student/getCardDetails', { resultId: book.id })).data);
      last = { ...last, id: book.id, parts: newParts(detail.parts, parts[book.id], last.delta), at: detail.at || last.at };
      parts[book.id] = detail.parts;
    } catch { /* the total's change is shown meanwhile */ }
  }
  const scores = {};
  for (const b of books) scores[b.id] = b.score;
  store.set(key, JSON.stringify({ v: 2, scores, parts, last }));
  return { last };
};
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const gradedText = (date) => {
  const days = -daysUntil(date);
  return `შეტანილია ${days <= 0 ? 'დღეს' : days === 1 ? 'გუშინ' : days === 2 ? 'გუშინწინ' : dmy(date)}`;
};
const viewCard = ({ last }) => {
  if (!last) return NO_GRADE;
  const [part] = onePart(last.parts);
  return {
    lines: [{ grade: {
      name: last.name, score: last.score,
      change: part ? `${signed(part.d)} ${part.name}`.trim() : last.delta ? `${signed(last.delta)} ქულა` : '',
      when: gradedText(new Date(last.at)),
    } }],
    caption: 'ბოლო შეფასება · Latest grade',
  };
};

// The countdown starts three hours before a lecture. Live: how far into the lecture. Before: how much of those hours has passed.
const SOON_MS = 3 * 3600 * 1000;
const countdownShare = (next, now) => {
  const start = next.start.getTime();
  const share = start <= now ? (now - start) / Math.max(1, next.end - start) : 1 - (start - now) / SOON_MS;
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
          prof: personName(d.profName),
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
  const soon = live || start - now <= SOON_MS;
  const lines = free
    ? [{ text: 'ხვალ თავისუფალი ხარ 🎉', cls: 'sx-val sx-lec-free' }, { text: `შემდეგი: ${dayLabel(next.start)}, ${hm(next.start)}`, cls: 'sx-val sx-lec-next' }]
    : soon ? [live ? 'მიმდინარეობს ახლა' : untilText(start), { bar: countdownShare(next, now) }]
    : [`${dayLabel(next.start)}, ${hm(next.start)}`];
  if (next.course) lines.push({ text: next.course, cls: 'sx-val sx-lec-course' });
  // The headline already names the day and start when the countdown is not running yet.
  const when = live ? `დღეს, ${span}` : free || soon ? `${dayLabel(next.start)}, ${span}` : span;
  lines.push(next.room ? `${when} · აუდიტორია ${next.room}` : when);
  if (next.prof) lines.push({ text: `ლექციას ატარებს ${next.prof}`, cls: 'sx-val sx-lec-who' });
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
  return { latest: latest && { id: latest.id, listId: latest.listId, name: latest.name, text: latest.text, course: latest.course, lecturer: latest.lecturer, posted: +latest.posted, end: latest.end ? +latest.end : null } };
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
    latest.listId != null && { text: 'დავალების გახსნა', go: `/tasks/${latest.listId}`, task: latest.id },
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
const forgetDashboard = () => { const s = session(); if (s) { store.remove(savedKey(s)); store.remove(`sx-grades:${s.studentId}`); } cache = null; };

// Fresh for five minutes per login token: data fetched before signing in (no token, or an expired one) never sticks.
const load = () => {
  const s = session();
  if (!s || !s.eduId) { if (cache) { cache = null; render(); } return Promise.resolve(); }
  current();
  if (cache && cache.token === s.token && Date.now() - cache.at < CACHE_MS) return Promise.resolve();
  if (loading) return loading;
  if (lastTry.token === s.token && Date.now() - lastTry.at < 30000) return Promise.resolve();
  // The task lists only share requests within one load: kept longer, a new assignment never showed.
  taskBooksCache = null; taskCache.clear();
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
// Subject on top; under it what was entered and when, beside the subject's total with its bar.
const gradeNode = (g) => {
  const info = el('span', 'sx-gr-info');
  if (g.change) info.append(el('span', 'sx-gr-change', g.change));
  info.append(el('span', 'sx-gr-when', g.when));
  const num = el('span', 'sx-gr-num', String(g.score));
  num.append(el('small', '', ' / 100'));
  const bar = el('span', 'sx-gr-bar');
  bar.append(el('i'));
  bar.style.setProperty('--p', (Math.min(100, Math.max(0, g.score)) / 100).toFixed(3));
  const score = el('span', 'sx-gr-score');
  score.append(num, bar);
  const row = el('span', 'sx-gr-row');
  row.append(info, score);
  const box = el('span', 'sx-gr');
  box.append(el('span', 'sx-gr-name', g.name), row);
  return box;
};
const lineNode = (t) => {
  if (t && t.grade) return gradeNode(t.grade);
  if (t && t.bar != null) return barNode(t.bar);
  if (t && t.week) return weekNode(t.week);
  if (t && t.box) {
    const w = el('div', 'sx-taskbox');
    w.append(...t.box.map((b) => {
      const node = el('span', b.go ? 'sx-task-open' : b.cls || 'sx-val', b.text);
      // Not an <a>: the whole card already is one. The handlers at the end of this file open the course's assignments.
      if (b.go) { node.dataset.go = b.go; if (b.task != null) node.dataset.task = b.task; node.setAttribute('role', 'link'); node.tabIndex = 0; }
      return node;
    }));
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

// Greeting above the boxes: name, date, today's lectures; beside it the final exams and the next day off.
const mountHello = () => {
  const cont = document.querySelector('dashboard-component .dashboard-item-container');
  let box = document.querySelector('.sx-hello');
  if (!cont) { box?.remove(); return; }
  const s = session();
  const now = new Date();
  const name = s ? s.firstName : '';
  const date = `${WEEKDAYS[weekdayOf(now)]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const line = todayLessonsLine();
  // Beside the greeting: this semester's final exams and the next day off.
  const exam = upcomingExams().find((x) => x.e.key === 'final');
  const off = nextPeriod(DAYS_OFF);
  const chips = [
    exam && { cls: 'sx-hello-final', cap: `${exam.e.ka} · ${exam.e.en}`, val: exam.p.state === 'now' ? 'მიმდინარეობს' : daysWord(exam.p.days), sub: rangeText(exam.p.start, exam.p.end) },
    off && { cls: 'sx-hello-off', cap: 'შემდეგი დასვენების დღე · Next day off', val: off.state === 'now' ? 'დღეს' : daysWord(off.days), sub: `${off.def[2]} · ${rangeText(off.start, off.end)}` },
  ].filter(Boolean);
  const key = JSON.stringify([name, date, line, chips]);
  if (box && box.dataset.key === key && box.nextElementSibling === cont) return;
  if (!box) box = el('div', 'sx-hello');
  box.dataset.key = key;
  const text = el('div', 'sx-hello-text');
  text.append(el('span', 'sx-hello-date', date), el('h1', 'sx-hello-title', name ? `გამარჯობა, ${name}` : 'გამარჯობა'));
  if (line) text.append(el('p', 'sx-hello-line', line));
  box.replaceChildren(text);
  if (chips.length) {
    const side = el('div', 'sx-hello-chips');
    side.append(...chips.map((c) => {
      const chip = el('div', `sx-hello-exam ${c.cls}`);
      chip.append(el('span', 'sx-hello-exam-cap', c.cap), el('span', 'sx-hello-exam-val', c.val), el('span', 'sx-hello-exam-sub', c.sub));
      return chip;
    }));
    box.append(side);
  }
  if (box.nextElementSibling !== cont) cont.before(box);
  // Lets phones lay greeting, boxes and the exam countdown out as one column (dashboard.css).
  if (!cont.parentElement.classList.contains('sx-dash-stack')) cont.parentElement.classList.add('sx-dash-stack');
};

// A day in the week strip opens the timetable at that day (timetable.js scrolls to it).
// The button in the assignments box opens that course's assignments instead of the card's own page, and there
// the assignment itself (assignments.js taps its row once the list is drawn).
let pendingTTDay = null;
let pendingTask = null;
const openTask = (e) => {
  const btn = e.target.closest && e.target.closest('.sx-task-open');
  if (!btn) return false;
  e.preventDefault();
  e.stopPropagation();
  pendingTask = btn.dataset.task ? { id: btn.dataset.task, path: btn.dataset.go, at: Date.now() } : null;
  go(btn.dataset.go);
  return true;
};
document.addEventListener('click', (e) => {
  if (openTask(e)) return;
  const day = e.target.closest && e.target.closest('a.dashboard-item-wrapper[href="/tables"] .sx-wk-day');
  pendingTTDay = day ? { iso: day.dataset.iso, at: Date.now() } : null;
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTask(e); }, true);
