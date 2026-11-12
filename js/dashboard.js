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
let knownLessons = null;
const todayLessonsLine = () => knownLessons
  ? todayLine(knownLessons.filter((l) => isToday(l.start.getTime())).map((l) => ({ start: l.start.getTime(), end: l.end, name: l.course })))
  : '';

// Each loader returns a function, so countdowns are rebuilt at render time.
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
  return () => {
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
};

const SECTIONS = { '/tables': loadNextLecture, '/tasks-books': loadTasks, '/learningCard': loadCard };
const FALLBACK = () => ({ lines: [], caption: 'გახსენით სანახავად' });
let cache = null;
let loading = null;

const load = () => {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve();
  if (loading) return loading;
  const s = session();
  if (!s || !s.eduId) { cache = { at: Date.now(), results: {} }; render(); return Promise.resolve(); }
  const hrefs = Object.keys(SECTIONS);
  loading = Promise.allSettled(hrefs.map((h) => SECTIONS[h](s))).then((settled) => {
    const results = {};
    settled.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) results[hrefs[i]] = r.value; });
    cache = { at: Date.now(), results };
    loading = null;
    render();
  });
  return loading;
};

const lineNode = (t) => {
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
    const result = cache ? (cache.results[href] || FALLBACK)() : null;
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
