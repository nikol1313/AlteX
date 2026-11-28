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
// Same course, same colour on every page (timetable, student card): a stable hash of its name picks one of 7 palette slots.
const courseHue = (name) => { let h = 0; for (const ch of String(name || '').trim()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return String(h % 7); };
// "Nothing here" notice at the end of wrap, one span per line; removed again once there is content.
const setEmpty = (wrap, show, ...lines) => {
  const note = wrap.querySelector(':scope > .sx-empty');
  if (show && !note) {
    const e = el('div', 'sx-empty');
    e.append(...lines.map((t) => el('span', null, t)));
    wrap.append(e);
  } else if (!show && note) note.remove();
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
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

// Read-only calls to the portal's own API with the student's token. An XMLHttpRequest like the portal's own, so in the
// Android app (one page world) js/api-cache.js answers it too: from memory, shared with the portal, and offline.
const api = (s, path, body) => new Promise((resolve, reject) => {
  const x = new XMLHttpRequest();
  x.open(body ? 'POST' : 'GET', path);
  x.setRequestHeader('Authorization', 'Bearer ' + s.token);
  if (body) x.setRequestHeader('Content-Type', 'application/json');
  x.addEventListener('load', () => {
    if (x.status < 200 || x.status > 299) { reject(new Error(path + ' ' + x.status)); return; }
    try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); }
  });
  x.addEventListener('error', () => reject(new Error(path + ' failed')));
  x.send(body ? JSON.stringify(body) : null);
});

const cardBooks = async (s) => {
  const res = await api(s, '/student/card');
  // A subject without points can come as null or "0": read as a number, so it is checked too instead of dropped.
  return ((res && res.card && res.card.books) || []).filter((b) => b && b.id != null)
    .map((b) => ({ ...b, score: parseFloat(String(b.score ?? '').replace(',', '.')) || 0 }));
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
