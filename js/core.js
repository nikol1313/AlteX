'use strict';
const root = document.documentElement;
root.classList.add('sx');

// Extension only: runs on the portal's own origin, so it can read the portal's token and call its API.
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
