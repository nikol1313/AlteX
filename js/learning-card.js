'use strict';
const PASS = 51;
const valueKind = (v) => (!v ? 'sx-est-empty' : /^[\d.,]+$/.test(v) ? 'sx-num' : /არა?\s+არის\s+დაშვ/.test(v) ? 'sx-denied' : 'sx-text');

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

// A subject's inline details get the same row classes as the breakdown dialog.
const tagDetailRows = () => {
  for (const d of document.querySelectorAll('.page-learningCard .result-detail')) {
    const name = d.querySelector('.result-detail-name');
    const val = d.querySelector('.result-detail-result');
    if (!name || !val) continue;
    const n = name.textContent.trim(), v = val.textContent.trim();
    const kind = valueKind(v);
    for (const c of ['sx-est-empty', 'sx-num', 'sx-denied', 'sx-text']) d.classList.toggle(c, c === kind);
    d.classList.add('sx-est-row');
    d.classList.toggle('sx-total', n === 'ჯამი');
    d.classList.toggle('sx-grade', n === 'შედეგი');
    if (n === 'შედეგი' && d.dataset.grade !== v.toUpperCase()) d.dataset.grade = v.toUpperCase();
    name.classList.add('sx-est-name');
    val.classList.add('sx-est-val');
  }
  for (const wrap of document.querySelectorAll('.page-learningCard .result-detail-wrapper')) {
    placeNeed(wrap, wrap.querySelector('.result-detail.sx-total .result-detail-result')?.textContent.trim());
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
const seenUnfolds = new WeakSet();
const fitDetailUnfold = () => {
  for (const row of document.querySelectorAll('.page-learningCard mat-row:has(> .mat-column-expandedDetail)')) {
    for (const anim of row.getAnimations()) {
      if (seenUnfolds.has(anim)) continue;
      seenUnfolds.add(anim);
      anim.ready.then(() => unfoldToAuto(anim), () => {});
    }
  }
};
// Runs from main.js's MutationObserver the moment the portal adds content, before it is painted. The regular pass
// would come up to 200ms later: the grade dialog (შეფასება) showed its raw vertical layout until then, and the
// unfold retarget would land near the end of the animation.
const onCardMutation = () => {
  enhanceEstDialog();
  if (!document.querySelector('.page-learningCard .mat-column-expandedDetail')) return;
  tagDetailRows();
  fitDetailUnfold();
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
  const score = Math.max(0, Math.min(100, parseFloat(scoreCell.textContent) || 0));
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
  let bar = scoreCell.querySelector(':scope > .sx-bar');
  if (!bar) { bar = el('span', 'sx-bar'); bar.append(el('i')); scoreCell.append(bar); }
  const w = `${score}%`;
  if (bar.firstChild.style.width !== w) bar.firstChild.style.width = w;
  return parseFloat(creditText) || 0;
};

const enhanceCard = () => {
  tagDetailRows();
  fitDetailUnfold();
  for (const sp of document.querySelectorAll('.page-learningCard .ini-block .last-stat h3 :is(span, b)')) {
    const isVal = /^\s*[\d.,]+\s*$/.test(sp.textContent);
    if (sp.classList.contains('sx-stat-val') !== isVal) sp.classList.toggle('sx-stat-val', isVal);
  }
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
  sems.forEach((sem, i) => {
    const head = sem.querySelector('mat-header-row');
    if (!head) return;
    const current = newest != null ? semNo[i] === newest : i === 0;
    const order = String(2 + rank.indexOf(i));
    if (sem.style.order !== order) sem.style.order = order;
    if (!sem.dataset.sxFold) sem.dataset.sxFold = current ? 'open' : 'closed';
    if (!head.dataset.sxBound) bindSemesterHead(sem, head);
    let credits = 0, count = 0;
    for (const row of sem.querySelectorAll('mat-row')) {
      const c = enhanceCourseRow(row, current, ended);
      if (c == null) continue;
      count++;
      credits += c;
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

const HEADER_VIEWS = { list: 'სემესტრებით · By semester', date_range: 'სასწავლო წლებით · By academic year' };
const enhanceCardHeader = () => {
  const box = document.querySelector('.page-learningCard .semesters');
  if (!box) return;
  for (const btn of box.querySelectorAll('.semester-item.button button')) {
    const label = HEADER_VIEWS[(btn.querySelector('mat-icon')?.textContent || '').trim()];
    if (label && btn.getAttribute('aria-label') !== label) { btn.setAttribute('aria-label', label); btn.title = label; }
    const active = btn.classList.contains('mat-primary');
    if (btn.getAttribute('aria-pressed') !== String(active)) btn.setAttribute('aria-pressed', String(active));
  }
  const select = box.querySelector('.semester-item:not(.button)');
  const value = select?.querySelector('.mat-mdc-select-value')?.textContent.trim();
  if (select && value && select.title !== value) select.title = value;
};
