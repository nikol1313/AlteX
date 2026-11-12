'use strict';
// The site renders the week as .headInfo blocks of .day-item "<b>label</b>: value<br>" pairs.
// A clearer card is added after each one (originals hidden by CSS), so week navigation keeps working.
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
    if (label && !label.querySelector('.sx-en')) label.prepend(el('span', 'sx-today-chip', 'Today · დღეს'), el('span', 'sx-en', day.en));

    const list = h.querySelector('.weeklist');
    if (!list) return;
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

const enhanceExams = () => {
  const today = isoDate(new Date());
  for (const row of document.querySelectorAll('ac-tables-component mat-row')) {
    const wd = row.querySelector('.exam-weekday');
    const day = wd && DAYS.find((d) => d.ka === wd.textContent.trim());
    if (day && row.dataset.day !== day.key) { row.dataset.day = day.key; wd.dataset.en = day.en; }
    const date = /\d{4}-\d{2}-\d{2}/.exec(row.querySelector('.mat-column-day > div')?.textContent || '');
    const when = !date ? '' : date[0] < today ? 'past' : date[0] === today ? 'today' : 'future';
    if (row.dataset.when !== when) row.dataset.when = when;
  }
};

// Foldable left rail built from the site's own tab links.
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
  store.set(RAIL_KEY, open ? '1' : '0');
};
const buildRail = (menu) => {
  const stored = store.get(RAIL_KEY);
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
    if (!root.classList.contains('sx-rail-open')) { setRail(true); return; }
    if (e.target.closest('.tables-tab-menu a') && window.innerWidth < 860) setRail(false);
  });
  document.addEventListener('click', (e) => {
    if (window.innerWidth >= 860 || !root.classList.contains('sx-rail-open')) return;
    if (e.target.closest('.tables-dashboard, .cdk-overlay-container')) return;
    setRail(false);
  });
  menu.append(el('span', 'sx-rail-hint'));
  // Phones always start with the lessons visible: opened, the rail covers the whole page.
  setRail(window.innerWidth > 760 && (stored != null ? stored === '1' : window.innerWidth > 1100));
};
const mountRail = () => {
  const menu = document.querySelector('.tables-dashboard');
  root.classList.toggle('sx-has-rail', !!menu);
  if (!menu) return;
  if (!menu.querySelector(':scope > .sx-rail-toggle')) buildRail(menu);
  let filters = menu.querySelector(':scope > .sx-rail-filters');
  if (!filters) {
    filters = el('div', 'sx-rail-filters');
    filters.append(el('span', 'sx-rail-label', 'სემესტრი და პროგრამა'));
    menu.querySelector('.tables-tab-menu')?.after(filters);
  }
  // Move the lecture timetable's semester/programme selectors (never the month picker) into the rail.
  const comp = document.querySelector('student-tables-component');
  const selectors = comp && comp.querySelector(':scope > div > div:first-child:has(> mat-form-field)');
  if (selectors) {
    selectors._sxHost = comp;
    if (selectors.parentElement !== filters) filters.append(selectors);
  }
  // Angular removes the component, not nodes moved out of it.
  for (const old of filters.querySelectorAll(':scope > div')) if (!old._sxHost || !old._sxHost.isConnected) old.remove();
  for (const a of menu.querySelectorAll('.tables-tab-menu a[href]')) {
    const en = TAB_EN[a.getAttribute('href')];
    if (en && a.dataset.en !== en) a.dataset.en = en;
  }
};

// Skeleton lessons until the site's own timetable request finishes (seen via resource timing).
const TABLES_WAIT_MS = 6000;
let tablesHost = null, tablesSince = 0, tablesDone = -1;
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name.includes('/registration/getStudentTables')) tablesDone = Math.max(tablesDone, e.responseEnd);
    schedule();
  }).observe({ type: 'resource', buffered: true });
} catch { /* the timeout ends the skeleton */ }
document.addEventListener('click', (e) => {
  if (e.target.closest('student-tables-component .calendar-navigation :is(button, a)')) { tablesSince = performance.now(); schedule(); }
}, true);
const enhanceTablesLoading = () => {
  const comp = document.querySelector('student-tables-component');
  if (comp !== tablesHost) { tablesHost = comp; tablesSince = performance.now(); }
  let waiting = false;
  if (comp && !comp.querySelector('.day-item')) {
    const waited = performance.now() - tablesSince;
    waiting = tablesDone < tablesSince - 1500 && waited < TABLES_WAIT_MS;
    if (waiting) setTimeout(schedule, TABLES_WAIT_MS - waited + 50);
  }
  if (root.classList.contains('sx-tt-loading') !== waiting) root.classList.toggle('sx-tt-loading', waiting);
  const cal = comp && comp.querySelector('.calendar');
  const skel = comp && comp.querySelector('.sx-tt-skel');
  const need = waiting && cal && !cal.querySelector('.weeklist-container > .headInfo');
  if (need && !skel) {
    const s = el('div', 'sx-tt-skel');
    s.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 7; i++) s.append(el('div', 'sx-tt-skel-day'));
    cal.append(s);
  } else if (!need && skel) skel.remove();
};

// Exam countdown tiles above the week, plus the next day off.
const mountExamStrip = () => {
  const comp = document.querySelector('student-tables-component');
  if (!comp) return;
  const tiles = upcomingExams().map(({ e, p }) => {
    if (p.state === 'now') return { e, big: 'ახლა', unit: '', sub: `${rangeText(p.start, p.end)} · ${p.left === 0 ? 'ბოლო დღე' : `დარჩა ${p.left} დღე`}`, pct: 100, state: 'now' };
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
  const nearest = [...tiles].sort((x, y) => (x.state === 'now' ? -1 : +x.big) - (y.state === 'now' ? -1 : +y.big))[0];
  const head = (ka, en) => { const h = el('div', 'sx-exam-head'); h.append(el('span', 'sx-exam-ka', ka), el('span', 'sx-exam-en', en)); return h; };
  strip.replaceChildren(...tiles.map((t) => {
    const tile = el('div', 'sx-exam');
    tile.dataset.exam = t.e.key;
    tile.dataset.state = t.state;
    if (t === nearest) tile.dataset.next = '1';
    const count = el('div', 'sx-exam-count');
    count.append(el('span', 'sx-exam-num', t.big));
    if (t.unit) count.append(el('span', 'sx-exam-unit', t.unit));
    const bar = el('div', 'sx-exam-bar');
    const fill = el('i'); fill.style.width = `${t.pct}%`; bar.append(fill);
    tile.append(head(t.e.ka, t.e.en), count, bar, el('span', 'sx-exam-sub', t.sub));
    return tile;
  }));
  if (off && offDef) {
    const tile = el('div', 'sx-exam sx-exam-off');
    tile.append(head('შემდეგი დასვენების დღე', 'Next day off'), el('div', 'sx-exam-offname', offDef[2]),
      el('span', 'sx-exam-sub', `${offDef[3]} · ${rangeText(off.start, off.end)} · ${off.state === 'now' ? 'დღეს' : daysWord(off.days)}`));
    strip.append(tile);
  }
  if (comp.firstElementChild !== strip) comp.prepend(strip);
};
