'use strict';
const PASS = 51;
const valueKind = (v) => (!v ? 'sx-est-empty' : /^[\d.,]+$/.test(v) ? 'sx-num' : /არა?\s+არის\s+დაშვ/.test(v) ? 'sx-denied' : /^დაშვებულია/.test(v) ? 'sx-allowed' : 'sx-text');

const placeNeed = (host, totalText) => {
  const total = parseFloat(String(totalText || '').replace(',', '.'));
  let line = host.querySelector(':scope > .sx-need');
  if (Number.isNaN(total)) { line?.remove(); return; }
  const gap = Math.round((PASS - total) * 100) / 100;
  const text = gap > 0 ? `ჩასაბარებლად გაკლია ${gap} ქულა · ზღვარი ${PASS}` : `ზღვარი ${PASS} გადალახულია · +${-gap} ქულა`;
  if (!line) line = el('div', 'sx-need');
  if (line.textContent !== text) line.textContent = text;
  line.classList.toggle('sx-passed', gap <= 0);
  if (host.lastElementChild !== line) host.append(line);
};

// An opened subject starts with the answer: points so far out of 100, a bar with the pass mark on it, and one
// sentence saying how many points are still needed (or that it is passed). The parts are listed under it.
const placeSummary = (wrap, totalText) => {
  const total = parseFloat(String(totalText || '').replace(',', '.'));
  let box = wrap.querySelector(':scope > .sx-dsum');
  if (Number.isNaN(total)) { box?.remove(); return; }
  const gap = Math.round((PASS - total) * 100) / 100;
  const key = `${total}`;
  if (box && box.dataset.key === key) { if (wrap.firstElementChild !== box) wrap.prepend(box); return; }
  if (!box) box = el('div', 'sx-dsum');
  box.dataset.key = key;
  box.classList.toggle('sx-passed', gap <= 0);
  const top = el('div', 'sx-dsum-top');
  top.append(el('span', 'sx-dsum-num', String(total)), el('span', 'sx-dsum-of', '/ 100 ქულა'));
  const bar = el('div', 'sx-dsum-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${total} ქულა 100-დან, ჩასაბარებლად საჭიროა ${PASS}`);
  const fill = el('i'); fill.style.width = `${Math.max(0, Math.min(100, total))}%`;
  const mark = el('b'); mark.style.left = `${PASS}%`;
  const label = el('span', 'sx-dsum-pass', String(PASS)); label.style.left = `${PASS}%`;
  bar.append(fill, mark, label);
  const note = el('div', 'sx-dsum-note', gap > 0 ? `ჩასაბარებლად კიდევ ${gap} ქულა გჭირდება` : 'ჩაბარებულია');
  box.replaceChildren(top, bar, note);
  wrap.prepend(box);
};

// A subject's inline details get the same row classes as the breakdown dialog.
const tagDetailRows = () => {
  for (const d of document.querySelectorAll('.page-learningCard .result-detail')) {
    const name = d.querySelector('.result-detail-name');
    const val = d.querySelector('.result-detail-result');
    if (!name || !val) continue;
    const n = name.textContent.trim(), v = val.textContent.trim();
    // Unchanged since it was tagged: nothing to do (this runs on every frame the portal touches the page).
    if (d.dataset.sxRow === `${n}|${v}`) continue;
    d.dataset.sxRow = `${n}|${v}`;
    const kind = valueKind(v);
    for (const c of ['sx-est-empty', 'sx-num', 'sx-denied', 'sx-allowed', 'sx-text']) d.classList.toggle(c, c === kind);
    d.classList.add('sx-est-row');
    d.classList.toggle('sx-total', n === 'ჯამი');
    d.classList.toggle('sx-grade', n === 'შედეგი');
    if (n === 'შედეგი' && d.dataset.grade !== v.toUpperCase()) d.dataset.grade = v.toUpperCase();
    name.classList.add('sx-est-name');
    val.classList.add('sx-est-val');
  }
  for (const wrap of document.querySelectorAll('.page-learningCard .result-detail-wrapper')) {
    placeSummary(wrap, wrap.querySelector('.result-detail.sx-total .result-detail-result')?.textContent.trim());
  }
};

// The portal unfolds a subject with a 225ms height animation to a pixel height it measured on the tap (always
// ~408px, before AlteX's rows and pass-mark line), then snaps to the real height when it ends: the "leap" on the
// first open. Point the animation's end at height: auto instead; with interpolate-size (learning-card.css) the
// browser resolves "auto" on every frame, so the unfold follows the content and ends exactly at its size.
// Retarget only once the animation has started: changing a still-pending one froze it at 0 in testing.
// Older Android WebViews (before 129) cannot animate to "auto": there the portal's own animation is left alone.
const CAN_UNFOLD_TO_AUTO = CSS.supports('interpolate-size', 'allow-keywords');
const unfoldToAuto = (anim) => {
  const fx = anim.effect;
  if (!CAN_UNFOLD_TO_AUTO || !fx || !fx.getKeyframes || anim.playState === 'finished') return;
  const frames = fx.getKeyframes();
  const end = frames[frames.length - 1];
  if (!end || !end.height || end.height === 'auto' || parseFloat(end.height) === 0) return; // folding up: leave it
  fx.setKeyframes(frames.map(({ computedOffset, ...f }, i) => (i === frames.length - 1 ? { ...f, height: 'auto' } : f)));
};
// One list of the page's running animations, instead of asking each of the card's rows for its own: that forced a
// style pass per row, on every change the portal made while a subject was unfolding.
const seenUnfolds = new WeakSet();
const fitDetailUnfold = () => {
  if (!CAN_UNFOLD_TO_AUTO) return;
  for (const anim of document.getAnimations()) {
    if (seenUnfolds.has(anim)) continue;
    seenUnfolds.add(anim);
    const row = anim.effect && anim.effect.target;
    if (!row || !row.matches || !row.matches('.page-learningCard mat-row') || !row.querySelector(':scope > .mat-column-expandedDetail')) continue;
    anim.ready.then(() => { try { unfoldToAuto(anim); } catch { /* the portal's own animation is left as it is */ } }, () => {});
  }
};
// A subject's details come from the portal's server: until they are there, the tapped row shows a moving line
// (learning-card.css), so a slow answer does not look like a frozen page.
document.addEventListener('click', (e) => {
  const row = e.target.closest && e.target.closest('.page-learningCard .semester-child mat-row');
  if (!row || e.target.closest('button, a') || row.querySelector(':scope > .mat-column-expandedDetail')) return;
  if (row.nextElementSibling && row.nextElementSibling.querySelector('.result-detail')) return;
  row.dataset.sxBusy = '';
  setTimeout(() => { delete row.dataset.sxBusy; }, 6000);
}, true);
// The fold arrow on each subject follows whether its details are open. The portal keeps a closed subject's details
// in the page at zero height, so "open" is read from the rendered height; checked again once its unfold has run.
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('.page-learningCard .semester-child mat-row')) { setTimeout(schedule, 60); setTimeout(schedule, 420); }
}, true);
const markOpenRows = () => {
  for (const row of document.querySelectorAll('.page-learningCard .semester-child mat-row:not(:has(.mat-column-expandedDetail))')) {
    const next = row.nextElementSibling;
    const detail = next && next.querySelector(':scope > .mat-column-expandedDetail');
    const open = !!detail && detail.getBoundingClientRect().height > 8;
    if (row.hasAttribute('data-sx-open') !== open) row.toggleAttribute('data-sx-open', open);
  }
};
const clearBusyRows = () => {
  for (const row of document.querySelectorAll('.page-learningCard mat-row[data-sx-busy]')) {
    if (row.nextElementSibling && row.nextElementSibling.querySelector('.result-detail')) delete row.dataset.sxBusy;
  }
};
// Called from main.js's MutationObserver whenever the portal changes the page; the work is done once, in the next
// frame, before that frame is painted: the grade dialog (შეფასება) never shows its raw vertical layout, and the
// unfold is retargeted as it starts. (Done per change, it ran many times a frame while a subject was unfolding.)
let cardFrame = false;
const onCardMutation = () => {
  if (cardFrame) return;
  cardFrame = true;
  requestAnimationFrame(() => {
    cardFrame = false;
    enhanceEstDialog();
    if (!document.querySelector('.page-learningCard .mat-column-expandedDetail')) return;
    clearBusyRows();
    tagDetailRows();
    fitDetailUnfold();
  });
};

// End of the running semester = the next payment date reported while it is the newest one,
// remembered per semester so it does not move when the portal moves on to the next payment.
const semEnds = new Map();
const semesterEnded = (no) => {
  if (no == null) return false;
  if (semEnds.get(no) === undefined) {
    semEnds.set(no, null);
    const s = session();
    if (s) {
      const key = `sx-sem-end:${s.studentId}:${no}`;
      const stored = store.get(key);
      if (stored) semEnds.set(no, parseDate(stored));
      else {
        api(s, '/student/finances/paymentReminder').then((res) => {
          const date = parseDate(res && res.paymentDate);
          if (!date) return;
          semEnds.set(no, date);
          store.set(key, res.paymentDate);
          schedule();
        }).catch(() => {});
      }
    }
  }
  const end = semEnds.get(no);
  return !!end && Date.now() >= end.getTime();
};

const toggleSemester = (sem) => {
  const open = sem.dataset.sxFold !== 'open';
  sem.dataset.sxFold = open ? 'open' : 'closed';
  sem.querySelector('mat-header-row')?.setAttribute('aria-expanded', String(open));
};
const bindSemesterHead = (sem, head) => {
  head.dataset.sxBound = '1';
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-expanded', String(sem.dataset.sxFold === 'open'));
  head.addEventListener('click', (e) => { if (!e.target.closest('button, a')) toggleSemester(sem); });
  head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSemester(sem); } });
};

// Subject name → real total, for subjects the portal prints short (see cardBooks in core.js). Fetched once per login:
// a log out does not reload the page, so the next student must not see these. A failed fetch is retried after 30s.
const realTotals = new Map();
let totalsFor = null, totalsAsked = false, totalsTried = 0;
const askRealTotals = () => {
  const s = session();
  if (!s) return;
  if (s.token !== totalsFor) { realTotals.clear(); totalsFor = s.token; totalsAsked = false; totalsTried = 0; }
  if (totalsAsked || Date.now() - totalsTried < 30000) return;
  totalsAsked = true;
  totalsTried = Date.now();
  cardBooks(s).then((books) => {
    if (s.token !== totalsFor) return;
    for (const b of books) if (b.score) realTotals.set(String(b.name).trim(), b.score);
    schedule();
  }).catch(() => { if (s.token === totalsFor) totalsAsked = false; });
};

const enhanceCourseRow = (row, current, ended) => {
  // Phones get one .responsive-row cell: name + .icons-row [lecturer, credits, score, grade].
  let scoreCell, creditText;
  const rr = row.querySelector('.responsive-row');
  if (rr) {
    const [lect, credit, score, grade] = rr.querySelectorAll(':scope > .icons-row > div');
    lect?.classList.add('sx-m-lect'); credit?.classList.add('sx-m-credit');
    score?.classList.add('sx-m-score'); grade?.classList.add('sx-m-grade');
    scoreCell = score; creditText = credit?.textContent;
  } else {
    if (!row.querySelector('.mat-column-bookName')) return null;
    scoreCell = row.querySelector('.mat-column-score');
    creditText = row.querySelector('.mat-column-credit')?.textContent;
  }
  if (!scoreCell) return null;
  const name = (rr ? rr.querySelector('.subj-name') : row.querySelector('.mat-column-bookName'))?.textContent;
  let score = Math.max(0, Math.min(100, parseFloat(scoreCell.textContent) || 0));
  if (current) {
    askRealTotals();
    const real = realTotals.get(String(name).trim());
    const text = document.createTreeWalker(scoreCell, NodeFilter.SHOW_TEXT, (n) => (n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)).nextNode();
    if (real > score && text) { text.data = String(real); score = Math.min(100, real); }
  }
  const chip = row.querySelector('.result-color');
  let grade = (chip?.textContent || '').trim().toUpperCase();
  // The site prints F for a running course until the points add up; it is real only once the semester ended.
  const running = current && !ended && score < PASS && (grade === 'F' || grade === '');
  if (running) grade = '';
  if (row.dataset.grade !== grade) row.dataset.grade = grade;
  if (row.hasAttribute('data-sx-running') !== running) {
    row.toggleAttribute('data-sx-running', running);
    if (chip && running) { chip.setAttribute('aria-label', 'მიმდინარე · In progress'); chip.title = 'მიმდინარე · In progress'; }
    else if (chip) { chip.removeAttribute('aria-label'); chip.removeAttribute('title'); }
  }
  const hue = courseHue(name);
  if (row.dataset.c !== hue) row.dataset.c = hue;
  let bar = scoreCell.querySelector(':scope > .sx-bar');
  if (!bar) { bar = el('span', 'sx-bar'); bar.append(el('i')); scoreCell.append(bar); }
  const w = `${score}%`;
  if (bar.firstChild.style.width !== w) bar.firstChild.style.width = w;
  return { credits: parseFloat(creditText) || 0, score };
};

const enhanceCard = () => {
  // Every pass on every page: off the card, return before getAnimations() forces a whole-page style update.
  if (!document.querySelector('.page-learningCard')) return;
  tagDetailRows();
  markOpenRows();
  fitDetailUnfold();
  mountStats();
  // Newest semester first; blocks without a number keep the site's order after the numbered ones.
  const sems = [...document.querySelectorAll('.page-learningCard .semester-child')];
  const semNo = sems.map((sem) => {
    const m = /(\d+)\s*სემესტრი/.exec(sem.querySelector('mat-header-row .mat-column-bookName')?.textContent || '');
    return m ? +m[1] : null;
  });
  const numbered = semNo.filter((n) => n != null);
  const newest = numbered.length ? Math.max(...numbered) : null;
  const ended = semesterEnded(newest);
  const rank = sems.map((_, i) => i).sort((x, y) => (semNo[y] ?? -1) - (semNo[x] ?? -1) || x - y);
  const trend = [];
  sems.forEach((sem, i) => {
    const head = sem.querySelector('mat-header-row');
    if (!head) return;
    const current = newest != null ? semNo[i] === newest : i === 0;
    const order = String(2 + rank.indexOf(i));
    if (sem.style.order !== order) sem.style.order = order;
    if (!sem.dataset.sxFold) sem.dataset.sxFold = current ? 'open' : 'closed';
    if (!head.dataset.sxBound) bindSemesterHead(sem, head);
    let credits = 0, count = 0, weighted = 0;
    for (const row of sem.querySelectorAll('mat-row')) {
      const c = enhanceCourseRow(row, current, ended);
      if (c == null) continue;
      count++;
      credits += c.credits;
      weighted += c.score * (c.credits || 1);
    }
    const avg = count ? Math.round(weighted / (credits || count)) : null;
    // The running semester's average is low only because its grades are still coming in: left out of the trend.
    if (avg != null && semNo[i] != null && !(current && !ended)) trend.push({ no: semNo[i], avg });
    let sum = head.querySelector(':scope > .sx-sem-sum');
    if (!sum) {
      if (current) head.append(el('span', 'sx-sem-badge', 'მიმდინარე · Current'));
      sum = el('span', 'sx-sem-sum');
      head.append(sum, el('span', 'sx-chev'));
    }
    const text = `${count} საგანი · ${credits} კრედიტი` + (avg != null ? ` · საშ. ${avg}` : '');
    if (sum.textContent !== text) sum.textContent = text;
  });
  mountTrend(trend.sort((a, b) => a.no - b.no));
};

// The portal's stats (GPA, credits, …) as clean cells: each heading's text split into its label and its number,
// whatever markup the portal wraps them in. The headings stay in the page, hidden (learning-card.css).
const mountStats = () => {
  const stats = document.querySelector('.page-learningCard .ini-block .last-stat');
  if (!stats) return;
  const items = [...stats.querySelectorAll(':scope > h3')].map((h) => {
    const copy = h.cloneNode(true);
    copy.querySelectorAll('mat-icon').forEach((i) => i.remove()); // icon names are ligature text ("star")
    const text = (copy.textContent || '').replace(/\s+/g, ' ').trim();
    const nums = text.match(/\d+(?:[.,]\d+)?/g);
    const value = nums ? nums[nums.length - 1] : '';
    const label = (value ? text.slice(0, text.lastIndexOf(value)) + text.slice(text.lastIndexOf(value) + value.length) : text)
      .replace(/^[\s:·-]+|[\s:·-]+$/g, '');
    return { label, value };
  }).filter((x) => x.label || x.value);
  const key = JSON.stringify(items);
  let box = stats.querySelector(':scope > .sx-card-stats');
  if (box && box.dataset.key === key) return;
  if (!box) { box = el('div', 'sx-card-stats'); stats.prepend(box); }
  box.dataset.key = key;
  box.replaceChildren(...items.map(({ label, value }) => {
    const c = el('div', 'sx-cstat');
    if (/gpa/i.test(label)) c.classList.add('sx-cstat-gpa');
    c.append(el('span', 'sx-cstat-label', label), el('span', 'sx-cstat-num', value || '—'));
    return c;
  }));
};

// Average score per semester (credit-weighted, from the rows above) as a small line in the stats panel.
const mountTrend = (pts) => {
  const stats = document.querySelector('.page-learningCard .ini-block .last-stat');
  let cell = stats && stats.querySelector(':scope > .sx-trend');
  if (!stats || pts.length < 2) { cell?.remove(); return; }
  const key = JSON.stringify(pts);
  if (cell && cell.dataset.key === key) return;
  if (!cell) { cell = el('div', 'sx-trend'); stats.append(cell); }
  cell.dataset.key = key;
  const lo = Math.min(...pts.map((p) => p.avg)) - 5, hi = Math.max(...pts.map((p) => p.avg)) + 5;
  const xy = pts.map((p, i) => [8 + (i * 384) / (pts.length - 1), 56 - ((p.avg - lo) / (hi - lo)) * 48]);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 400 64');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', xy.map((q) => q.join(',')).join(' '));
  line.setAttribute('pathLength', '1');
  svg.append(line);
  const plot = el('div', 'sx-trend-plot');
  const labels = el('div', 'sx-trend-pts');
  pts.forEach((p, i) => {
    const dot = el('i', i === pts.length - 1 ? 'sx-trend-now' : null);
    dot.style.left = `${(xy[i][0] / 400) * 100}%`;
    dot.style.top = `${(xy[i][1] / 64) * 100}%`;
    plot.append(dot);
    const lab = el('span');
    lab.append(el('b', null, String(p.avg)), el('small', null, `${p.no} სემესტრი`));
    labels.append(lab);
  });
  plot.prepend(svg);
  cell.replaceChildren(el('span', 'sx-trend-label', 'საშუალო ქულა 100-დან · დასრულებული სემესტრები'), plot, labels);
  cell.setAttribute('role', 'img');
  cell.setAttribute('aria-label', 'საშუალო ქულა სემესტრების მიხედვით: ' + pts.map((p) => `${p.no} სემესტრი ${p.avg}`).join(', '));
};

// Grade breakdown dialog: the site's rotated names and values become one list.
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
      const row = el('div', 'sx-est-row ' + valueKind(value));
      if (name === 'ჯამი') row.classList.add('sx-total');
      if (name === 'შედეგი') { row.classList.add('sx-grade'); row.dataset.grade = value.toUpperCase(); }
      row.append(el('span', 'sx-est-name', name), el('span', 'sx-est-val', value || '—'));
      return row;
    }));
    placeNeed(list, values[names.indexOf('ჯამი')]);
  }
};

const HEADER_VIEWS = { list: ['სემესტრებით · By semester', 'სემესტრები'], date_range: ['სასწავლო წლებით · By academic year', 'სასწავლო წლები'] };
const enhanceCardHeader = () => {
  const box = document.querySelector('.page-learningCard .semesters');
  if (!box) return;
  for (const btn of box.querySelectorAll('.semester-item.button button')) {
    const [label, short] = HEADER_VIEWS[(btn.querySelector('mat-icon')?.textContent || '').trim()] || [];
    if (label && btn.getAttribute('aria-label') !== label) { btn.setAttribute('aria-label', label); btn.title = label; }
    if (short && btn.dataset.sxLabel !== short) btn.dataset.sxLabel = short;
    const active = btn.classList.contains('mat-primary');
    if (btn.getAttribute('aria-pressed') !== String(active)) btn.setAttribute('aria-pressed', String(active));
  }
  const select = box.querySelector('.semester-item:not(.button)');
  const value = select?.querySelector('.mat-mdc-select-value')?.textContent.trim();
  if (select && value && select.title !== value) select.title = value;
};
