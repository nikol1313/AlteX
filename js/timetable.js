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

const LESSON_MIN = 60; // shortcut: a lesson without a duration is drawn as one hour; fix if the portal starts omitting it often

const buildLesson = (l) => {
  const start = toMin(l.time);
  const dur = parseInt(l.duration, 10);
  const end = start == null ? null : start + (dur > 0 ? dur : LESSON_MIN);
  const box = el('div', 'sx-lesson');
  box.tabIndex = 0;
  box.dataset.c = courseHue(l.course);
  const top = el('div', 'sx-l-top');
  top.append(el('span', 'sx-time', l.time ? (end != null ? `${l.time}–${fromMin(end)}` : l.time) : '—'));
  if (l.room) top.append(el('span', 'sx-room', l.room));
  box.append(top, el('div', 'sx-course', l.course || ''));
  const meta = [l.type, dur > 0 ? `${dur} წთ` : ''].filter(Boolean).join(' · ');
  if (meta) box.append(el('div', 'sx-meta', meta));
  if (l.lecturer) box.append(el('div', 'sx-lecturer', l.lecturer));
  box.append(el('i', 'sx-l-fill'));
  box._sx = { start, end };
  return box;
};

// Lessons that overlap are stacked, full width, one under the other: together they fill the overlapping stretch
// (earliest start to latest end), so the group still lines up with the hour axis. Each card keeps its real times.
const stackOverlaps = (views) => {
  const timed = views.filter((v) => v._sx.start != null).sort((a, b) => a._sx.start - b._sx.start);
  let group = [], from = 0, to = -1;
  const place = () => {
    group.forEach((v, k) => {
      const one = group.length === 1;
      const s = one ? v._sx.start : from + ((to - from) * k) / group.length;
      const e = one ? v._sx.end : from + ((to - from) * (k + 1)) / group.length;
      v.style.setProperty('--s', s);
      v.style.setProperty('--e', e);
      v.toggleAttribute('data-stacked', !one);
    });
    group = [];
  };
  for (const v of timed) {
    if (v._sx.start >= to) { place(); from = v._sx.start; to = v._sx.end; }
    group.push(v);
    to = Math.max(to, v._sx.end);
  }
  place();
};

// Hour labels down the left edge, one per hour of the week's range.
const mountAxis = (wrap, t0, t1) => {
  let axis = wrap.querySelector(':scope > .sx-tt-axis');
  const key = `${t0}-${t1}`;
  if (axis && axis.dataset.range === key) { if (wrap.firstElementChild !== axis) wrap.prepend(axis); return; }
  if (!axis) { axis = el('div', 'sx-tt-axis'); axis.setAttribute('aria-hidden', 'true'); }
  axis.dataset.range = key;
  const hours = [];
  for (let m = t0; m <= t1; m += 60) { const h = el('span', 'sx-hour', fromMin(m)); h.style.setProperty('--m', m); hours.push(h); }
  axis.replaceChildren(...hours);
  wrap.prepend(axis);
};

// Week summary next to the month name: how many lessons and hours this week.
const mountWeekSum = (count, minutes) => {
  const nav = document.querySelector('student-tables-component .calendar-navigation');
  if (!nav) return;
  let sum = nav.querySelector(':scope > .sx-tt-sum');
  const text = count ? `${count} ლექცია · ${Math.round(minutes / 6) / 10} სთ ამ კვირაში` : 'ამ კვირაში ლექციები არ არის';
  if (!sum) { sum = el('span', 'sx-tt-sum'); nav.append(sum); }
  if (sum.textContent !== text) sum.textContent = text;
};

const enhanceWeek = () => {
  const wrap = document.querySelector('.weeklist-container');
  const heads = [...document.querySelectorAll('.weeklist-container > .headInfo')];
  if (!wrap || !heads.length) { if (root.classList.contains('sx-tt-turned')) setTurned(false); return; }
  const nowIdx = heads.findIndex((h) => h.classList.contains('now'));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let t0 = Infinity, t1 = -Infinity, count = 0, minutes = 0;

  heads.forEach((h, i) => {
    const ka = (h.querySelector('.day-name') || {}).textContent;
    const day = DAYS.find((d) => d.ka === (ka || '').trim()) || DAYS[i] || DAYS[0];
    const when = nowIdx < 0 ? 'week' : i < nowIdx ? 'past' : i === nowIdx ? 'today' : 'future';
    if (h.dataset.day !== day.key) h.dataset.day = day.key;
    if (h.dataset.when !== when) h.dataset.when = when;
    h.style.setProperty('--i', i);

    const label = h.querySelector('.day-title .mdc-button__label') || h.querySelector('.day-title');
    if (label && !label.querySelector('.sx-en')) label.prepend(el('span', 'sx-en', day.en.slice(0, 3)));
    const badge = h.querySelector(':scope > .sx-today');
    if (when === 'today' && !badge) h.append(el('span', 'sx-today', 'დღეს'));
    else if (when !== 'today') badge?.remove();
    // Phones: small moving chevrons at the header's edges say the week goes on to either side (timetable.css).
    if (!h.querySelector(':scope > .sx-swipe')) {
      for (const dir of ['prev', 'next']) { const s = el('span', 'sx-swipe'); s.dataset.dir = dir; s.setAttribute('aria-hidden', 'true'); h.append(s); }
    }

    const list = h.querySelector('.weeklist');
    // The portal leaves the lesson list out of a day with no lessons (seen on Sundays): that day is empty too.
    if (!list) { if (!h.hasAttribute('data-empty')) h.setAttribute('data-empty', ''); return; }
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
    stackOverlaps(views);
    const empty = !items.length;
    if (h.hasAttribute('data-empty') !== empty) h.toggleAttribute('data-empty', empty);
    let nextMarked = false;
    views.forEach((v, n) => {
      const t = v._sx;
      v.style.setProperty('--n', n);
      if (t.start != null) { t0 = Math.min(t0, t.start); t1 = Math.max(t1, t.end); count++; minutes += t.end - t.start; }
      let status = '';
      if (when === 'today' && t.start != null) {
        if (t.end <= nowMin) status = 'done';
        else if (t.start <= nowMin) { status = 'live'; nextMarked = true; }
        else if (!nextMarked) { status = 'next'; nextMarked = true; }
      }
      if (status === 'live') v.style.setProperty('--p', ((nowMin - t.start) / (t.end - t.start)).toFixed(3));
      if (v.dataset.status !== status) {
        v.dataset.status = status;
        v.querySelector('.sx-status')?.remove();
        if (status) v.querySelector('.sx-l-top').prepend(el('span', 'sx-status', status === 'live' ? 'ახლა' : status === 'next' ? 'შემდეგი' : 'დასრულდა'));
      }
    });
    setEmpty(list, empty, 'თავისუფალი დღე');
  });

  // Range: whole hours around the week's lessons, at least 09:00–18:00, so short weeks keep a calm grid.
  t0 = Math.min(9 * 60, Math.floor(t0 / 60) * 60);
  t1 = Math.max(18 * 60, Math.ceil(t1 / 60) * 60);
  if (wrap.style.getPropertyValue('--t0') !== String(t0)) wrap.style.setProperty('--t0', t0);
  if (wrap.style.getPropertyValue('--t1') !== String(t1)) wrap.style.setProperty('--t1', t1);
  mountAxis(wrap, t0, t1);
  mountWeekSum(count, minutes);
  mountDayPager(wrap, heads); // before --tt-top is measured: the pager sits above the grid
  // Where the grid starts on the page (after the summary line, which can wrap above it), so CSS can size the hours to end at the bottom of the window.
  // Measured only when something that moves it changed: the read forces a whole-page style and layout update.
  const topKey = `${innerWidth}|${count}|${minutes}|${heads[0]?.textContent.slice(0, 40)}|${wrap.previousElementSibling?.textContent.length}`;
  if (wrap._sxTopKey !== topKey) {
    wrap._sxTopKey = topKey;
    const top = `${Math.round(wrap.getBoundingClientRect().top + scrollY)}px`;
    if (wrap.style.getPropertyValue('--tt-top') !== top) wrap.style.setProperty('--tt-top', top);
  }

  // The red "now" line across today's column.
  const today = nowIdx >= 0 ? heads[nowIdx].querySelector('.weeklist') : null;
  const showNow = today && nowMin >= t0 && nowMin <= t1;
  for (const line of wrap.querySelectorAll('.sx-now')) if (!showNow || line.parentElement !== today) line.remove();
  const axis = wrap.querySelector(':scope > .sx-tt-axis');
  let tag = axis.querySelector(':scope > .sx-now-tag');
  if (!showNow) tag?.remove();
  else {
    let line = today.querySelector(':scope > .sx-now');
    if (!line) { line = el('div', 'sx-now'); line.setAttribute('aria-hidden', 'true'); today.append(line); }
    if (!tag) { tag = el('span', 'sx-now-tag'); axis.append(tag); }
    line.style.setProperty('--m', nowMin);
    tag.style.setProperty('--m', nowMin);
    if (tag.textContent !== hm(now)) tag.textContent = hm(now);
  }
  // Narrow screens scroll the week sideways: start on today, once per rendered week.
  // Checked once per week and window width (each check forces a layout); scrolled only when the week overflows.
  const scrollKey = `${innerWidth}|${heads[0].textContent.slice(0, 40)}`;
  if (nowIdx >= 0 && wrap.dataset.sxScrolled !== scrollKey) {
    wrap.dataset.sxScrolled = scrollKey;
    if (wrap.scrollWidth > wrap.clientWidth + 4) wrap.scrollLeft = heads[nowIdx].offsetLeft - (wrap.querySelector('.sx-tt-axis')?.offsetWidth || 0);
  }
  focusPendingDay(heads);
};

// ---------- Phones: one day per screen, arrows to step through the week, and the whole week turned sideways ----------
const PHONE_WEEK = matchMedia('(max-width: 760px)');
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON_PREV = SVG('M15 5l-7 7 7 7');
const ICON_NEXT = SVG('M9 5l7 7-7 7');
// A phone outline with a turning arrow: "show the week sideways".
const ICON_TURN = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="6" width="7" height="12" rx="1.6"/><path d="M2.6 13.5A9.5 9.5 0 0 1 9.5 2.8M21.4 10.5a9.5 9.5 0 0 1-6.9 10.7"/><path d="M7.2 1.4l2.3 1.4-1.4 2.3M16.8 22.6l-2.3-1.4 1.4-2.3"/></svg>';
const ICON_CLOSE = SVG('M6 6l12 12M18 6L6 18');
const shownDays = (heads) => heads.filter((h) => h.getClientRects().length);
// Which day the week is scrolled to: one day is one column width.
const pagerIndex = (wrap, days) => (days[0] ? Math.round(wrap.scrollLeft / days[0].offsetWidth) : 0);
const syncPager = (wrap, bar) => {
  const days = shownDays([...wrap.querySelectorAll(':scope > .headInfo')]);
  const i = Math.max(0, Math.min(days.length - 1, pagerIndex(wrap, days)));
  const dots = bar.querySelector('.sx-tt-dots');
  if (dots.children.length !== days.length) {
    dots.replaceChildren(...days.map((d) => { const b = el('i'); if (d.dataset.when === 'today') b.dataset.today = ''; return b; }));
  }
  [...dots.children].forEach((b, n) => b.toggleAttribute('data-on', n === i));
  bar.querySelector('.sx-tt-prev').disabled = i <= 0;
  bar.querySelector('.sx-tt-next').disabled = i >= days.length - 1;
  const name = days[i]?.querySelector('.day-name')?.textContent.trim();
  if (name) bar.querySelector('.sx-tt-dots').setAttribute('aria-label', `${name} · ${i + 1} / ${days.length}`);
};
const stepDay = (wrap, dir) => {
  const days = shownDays([...wrap.querySelectorAll(':scope > .headInfo')]);
  if (!days[0]) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  wrap.scrollBy({ left: dir * days[0].offsetWidth, behavior: reduce ? 'auto' : 'smooth' });
};
const setTurned = (on) => {
  if (root.classList.contains('sx-tt-turned') === on) return;
  root.classList.toggle('sx-tt-turned', on);
  if (on) {
    const scrim = el('div', 'sx-tt-scrim');
    const close = el('button', 'sx-tt-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'დახურვა · Close');
    close.innerHTML = ICON_CLOSE;
    scrim.addEventListener('click', () => setTurned(false));
    close.addEventListener('click', () => setTurned(false));
    document.body.append(scrim, close);
  } else document.querySelectorAll('body > :is(.sx-tt-scrim, .sx-tt-close)').forEach((e) => e.remove());
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('sx-tt-turned')) setTurned(false); });
// Leaving the timetable or widening the window ends the sideways view.
PHONE_WEEK.addEventListener('change', () => { if (!PHONE_WEEK.matches) setTurned(false); schedule(); });
const mountDayPager = (wrap, heads) => {
  let bar = wrap.previousElementSibling?.classList.contains('sx-tt-pager') ? wrap.previousElementSibling : null;
  if (!PHONE_WEEK.matches) { bar?.remove(); setTurned(false); return; }
  if (!bar) {
    bar = el('div', 'sx-tt-pager');
    const btn = (cls, label, icon, fn) => {
      const b = el('button', cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.innerHTML = icon;
      b.addEventListener('click', fn);
      return b;
    };
    const dots = el('div', 'sx-tt-dots');
    dots.setAttribute('role', 'status');
    bar.append(
      btn('sx-tt-prev', 'წინა დღე · Previous day', ICON_PREV, () => stepDay(wrap, -1)),
      dots,
      btn('sx-tt-next', 'შემდეგი დღე · Next day', ICON_NEXT, () => stepDay(wrap, 1)),
      btn('sx-tt-turn', 'მთელი კვირა გვერდულად · Whole week sideways', ICON_TURN, () => setTurned(true)),
    );
    wrap.before(bar);
  }
  if (!wrap._sxPager) {
    wrap._sxPager = true;
    // A tap on the grid itself (not a lesson, not a control) turns the week sideways too; a swipe fires no click.
    wrap.addEventListener('click', (e) => {
      if (!PHONE_WEEK.matches || root.classList.contains('sx-tt-turned') || e.target.closest('.sx-lesson, button, a, .sx-exams')) return;
      setTurned(true);
    });
    let frame = 0;
    wrap.addEventListener('scroll', () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; const b = wrap.previousElementSibling; if (b?.classList.contains('sx-tt-pager')) syncPager(wrap, b); });
    }, { passive: true });
  }
  // Measured (a forced layout) only when the week or the window changed; scrolling keeps it current otherwise.
  const key = `${innerWidth}|${heads.length}|${heads[0].textContent.slice(0, 40)}`;
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    const days = shownDays(heads);
    days.forEach((d, i) => { d.toggleAttribute('data-sx-first', i === 0); d.toggleAttribute('data-sx-last', i === days.length - 1); });
    syncPager(wrap, bar);
  }
};

// Set by a click on the dashboard week strip: bring that day into view once the current week has rendered.
const focusPendingDay = (heads) => {
  if (!pendingTTDay || root.classList.contains('sx-tt-loading')) return;
  const { iso, at } = pendingTTDay;
  pendingTTDay = null;
  const day = weekDates(0).find((d) => d.date === iso);
  if (!day || Date.now() - at > 15000) return;
  const head = heads.find((h) => h.dataset.day === DAYS[day.d - 1].key);
  if (!head) return;
  head.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  head.classList.add('sx-tt-focus');
  setTimeout(() => head.classList.remove('sx-tt-focus'), 1800);
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
// Phones: a press outside the open rail closes it. Added once (the rail is rebuilt on every visit to the timetable).
document.addEventListener('click', (e) => {
  if (window.innerWidth >= 860 || !root.classList.contains('sx-rail-open')) return;
  if (e.target.closest('.tables-dashboard, .cdk-overlay-container')) return;
  setRail(false);
});
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
    if (e.target.closest('.sx-rail-toggle') || PHONE_WEEK.matches) return; // phones: tabs sit on top, no rail to open
    if (!root.classList.contains('sx-rail-open')) { setRail(true); return; }
    if (e.target.closest('.tables-tab-menu a') && window.innerWidth < 860) setRail(false);
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

// Exam countdown tiles, plus the next day off. With no lessons on Sunday (and the week shown as columns, not the phone
// layout) they take Sunday's column; otherwise they sit under the week.
const WIDE_WEEK = matchMedia('(min-width: 761px)');
WIDE_WEEK.addEventListener('change', () => schedule());
const placeExamStrip = (comp, strip) => {
  const sunday = comp.querySelector('.weeklist-container > .headInfo[data-day="sun"]');
  // Wide lecture timetable: where the countdowns go (a free Sunday column or the top) is known only once the week is
  // drawn. Placed before that, they flashed at the top on every reload and then jumped into the column.
  const cal = comp.querySelector('.calendar');
  if (WIDE_WEEK.matches && cal && (root.classList.contains('sx-tt-loading') || !cal.querySelector('.weeklist-container > .headInfo'))) { strip.remove(); return; }
  const cols = WIDE_WEEK.matches && sunday && sunday.hasAttribute('data-empty') ? sunday.parentElement : null;
  if (strip.hasAttribute('data-col') !== !!cols) strip.toggleAttribute('data-col', !!cols);
  if (cols) { if (cols.lastElementChild !== strip) cols.append(strip); } else if (comp.firstElementChild !== strip) comp.prepend(strip);
};
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
  const key = JSON.stringify([tiles.map((t) => [t.big, t.sub, Math.round(t.pct)]), off && [off.state, off.days, off.start.getTime()]]);
  let strip = comp.querySelector('.sx-exams');
  if (strip && strip.dataset.key === key) { placeExamStrip(comp, strip); return; }
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
  if (off) {
    const tile = el('div', 'sx-exam sx-exam-off');
    tile.append(head('შემდეგი დასვენების დღე', 'Next day off'), el('div', 'sx-exam-offname', off.def[2]),
      el('span', 'sx-exam-sub', `${off.def[3]} · ${rangeText(off.start, off.end)} · ${off.state === 'now' ? 'დღეს' : daysWord(off.days)}`));
    strip.append(tile);
  }
  placeExamStrip(comp, strip);
};
