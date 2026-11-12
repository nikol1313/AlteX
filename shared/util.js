'use strict';
// Pure helpers shared by the extension (js/) and the PWA (pwa/). No portal or extension APIs here.
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
