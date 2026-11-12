'use strict';
// Academic calendar 2026/2027 (bachelor). Replace when the next year's calendar is published.
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

const daysWord = (n) => (n === 1 ? 'ხვალ' : `${n} დღეში`);
const rangeText = (a, b) => {
  if (a.getTime() === b.getTime()) return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
};

// First period that has not ended: { state: 'soon' | 'now', days, left, start, end } or null.
const nextPeriod = (periods) => {
  const t = today0();
  for (const [a, b] of periods) {
    const start = dayOf(a), end = dayOf(b);
    if (end < t) continue;
    return start <= t ? { state: 'now', days: 0, left: daysUntil(end), start, end } : { state: 'soon', days: daysUntil(start), start, end };
  }
  return null;
};

// Only the running semester's exams, so a finished one never counts down to next year.
const currentPeriods = (periods) => {
  const starts = SEMESTER_STARTS.map(dayOf);
  const i = Math.max(0, Math.min(starts.filter((d) => d <= today0()).length - 1, starts.length - 1));
  const lo = starts[i], hi = starts[i + 1];
  return periods.filter(([a]) => { const s = dayOf(a); return s >= lo && (!hi || s < hi); });
};

const upcomingExams = () => EXAMS.map((e) => ({ e, p: nextPeriod(currentPeriods(e.periods)) })).filter((x) => x.p);
