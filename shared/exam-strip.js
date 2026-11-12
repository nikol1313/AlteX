'use strict';
// Exam countdown tiles + next day off. Used by the extension (timetable page) and the PWA (home).
const examStripData = () => {
  const tiles = upcomingExams().map(({ e, p }) => {
    if (p.state === 'now') return { e, big: 'ახლა', unit: '', sub: `${rangeText(p.start, p.end)} · ${p.left === 0 ? 'ბოლო დღე' : `დარჩა ${p.left} დღე`}`, pct: 100, state: 'now' };
    const from = SEMESTER_STARTS.map(dayOf).filter((d) => d <= today0() && d < p.start).pop();
    const pct = from ? Math.max(0, Math.min(100, ((today0() - from) / (p.start - from)) * 100)) : 0;
    return { e, big: String(p.days), unit: 'დღე დარჩა', sub: `${rangeText(p.start, p.end)} ${p.start.getFullYear()}`, pct, state: 'soon' };
  });
  const off = nextPeriod(DAYS_OFF);
  const offDef = off && DAYS_OFF.find(([a]) => dayOf(a).getTime() === off.start.getTime());
  return { tiles, off, offDef };
};

// Fills (or refreshes) a <section class="sx-exams">; does nothing when the data is unchanged.
const fillExamStrip = (strip) => {
  const { tiles, off, offDef } = examStripData();
  const key = JSON.stringify([tiles.map((t) => [t.big, t.sub, Math.round(t.pct)]), off && [off.state, off.days, off.start.getTime()]]);
  if (strip.dataset.key === key) return;
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
};
