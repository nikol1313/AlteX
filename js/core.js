'use strict';
const root = document.documentElement;
root.classList.add('sx');

const DAYS = [
  { ka: 'ორშაბათი', en: 'Monday', key: 'mon' },
  { ka: 'სამშაბათი', en: 'Tuesday', key: 'tue' },
  { ka: 'ოთხშაბათი', en: 'Wednesday', key: 'wed' },
  { ka: 'ხუთშაბათი', en: 'Thursday', key: 'thu' },
  { ka: 'პარასკევი', en: 'Friday', key: 'fri' },
  { ka: 'შაბათი', en: 'Saturday', key: 'sat' },
  { ka: 'კვირა', en: 'Sunday', key: 'sun' },
];
const WEEKDAYS = DAYS.map((d) => d.ka);
const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const weekdayOf = (d) => (d.getDay() + 6) % 7;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const daysUntil = (date) => Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - today0()) / 86400000);
const isToday = (ms) => { const t = today0().getTime(); return ms >= t && ms < t + 86400000; };
const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};
const plainText = (html) => (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

const session = () => {
  const token = store.get('Student-Token');
  if (!token) return null;
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    let firstName = claims.firstName || '';
    try { firstName = decodeURIComponent(escape(firstName)); } catch { /* already decoded */ }
    return { token, studentId: claims.id, eduId: claims.currentProgram && claims.currentProgram.eduId, firstName };
  } catch { return null; }
};

// Read-only calls to the portal's own API with the student's token.
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

// Monday..Sunday of a week, in the shape the timetable endpoint expects.
const weekDates = (offsetWeeks) => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekdayOf(now) + 7 * offsetWeeks);
  return WEEKDAYS.map((day, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { d: i + 1, day, number: String(d.getDate()), date: isoDate(d), month: d.toLocaleString('en-US', { month: 'long' }) };
  });
};
