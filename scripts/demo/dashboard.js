// Demo dashboard: the three tiles AlteX fills in, the section tiles it turns into a nav bar, and made-up API answers.
const { page, SECTIONS } = require('./shell');

// Monday 16 November 2026, 12:40 in Tbilisi: the next lecture starts in 1 h 50 min.
const NOW = '2026-11-16T12:40:00+04:00';

const tile = (href, title) => `<a class="dashboard-item-wrapper" href="${href}"><div class="dashboard-item"><div class="title">${title}</div></div></a>`;
const BODY = page(`<dashboard-component><div class="width"><div class="dashboard-item-container">
  ${tile('/tables', 'ცხრილი · Schedule')}
  ${tile('/tasks-books', 'დავალებები · Assignments')}
  ${tile('/learningCard', 'სასწავლო ბარათი · Learning card')}
  ${SECTIONS.map(([href, title, n]) => `<a class="dashboard-item-wrapper" href="${href}"><div class="dashboard-item"><div class="title">${title}</div><span class="notify">${n}</span></div></a>`).join('')}
</div></div></dashboard-component>`, { links: false });

// Timetable: [Mon..Sun] lists of lessons, the same shape for both weeks.
const lesson = (h, m, course, prof, room, duration = 90) => ({ data: { h, m, duration, profName: prof, activity_type: 'lecture_seminar', auditorium: { name: room } }, item: { book: { name: course } } });
const WEEK = [
  [lesson(10, 0, 'მონაცემთა სტრუქტურები', 'ნინო კვარაცხელია', '305'), lesson(14, 30, 'ხელოვნური ინტელექტი', 'დავით ლომიძე', '204')],
  [lesson(11, 0, 'ალბათობა და სტატისტიკა', 'თამარ გელაშვილი', '112')],
  [lesson(9, 30, 'ვებ-ტექნოლოგიები', 'ლევან ჩიქოვანი', '410'), lesson(12, 0, 'მონაცემთა სტრუქტურები', 'ნინო კვარაცხელია', '305'), lesson(15, 0, 'ინგლისური ენა B2', 'ანა მესხი', '018')],
  [lesson(13, 0, 'ხელოვნური ინტელექტი', 'დავით ლომიძე', '204')],
  [lesson(10, 0, 'ოპერაციული სისტემები', 'გიორგი ნადირაძე', '307'), lesson(12, 30, 'ალბათობა და სტატისტიკა', 'თამარ გელაშვილი', '112')],
  [], [],
];

const part = (coId, name, value, sub, at) => ({ coId, name, componentType: 1, result: value, updated_at: at, items: [{ key: 0, value }], data: { items: [{ name: sub }] } });
const API = {
  '/student/registration/group/getGroupForRegistration': { selectedGroupId: 7 },
  '/student/registration/getStudentTables': { data: WEEK },
  '/student/getStudentTaskBooks/': { data: [{ id: 1, listId: 3101, name: 'ხელოვნური ინტელექტი' }] },
  '/student/tasks/': { data: [{
    id: 52017, listId: 3101, name: 'დავალება 4: ძებნის ალგორითმები',
    text: 'დაწერეთ A* ალგორითმი ლაბირინთისთვის და შეადარეთ BFS-ს. ატვირთეთ კოდი და მოკლე ანგარიში.',
    created_at: '2026-11-15T07:10:00.000000Z', endDate: '2026-11-22 23:59:00', files: [], lecturer: 'დავით ლომიძე',
  }] },
  '/student/card': { card: { books: [
    { id: 21, name: 'მონაცემთა სტრუქტურები', score: 38, semester: 5 },
    { id: 22, name: 'ხელოვნური ინტელექტი', score: 31, semester: 5 },
  ] } },
  '/student/getCardDetails': { data: [
    part(1, 'ქვიზი', '8', 'ქვიზი 2', '2026-11-15T09:00:00.000000Z'),
    part(2, 'შუალედური გამოცდა', '30', 'შუალედური გამოცდა', '2026-11-09T09:00:00.000000Z'),
    { coId: 9, name: 'ჯამი', componentType: 3, result: '<b>38</b>', items: [] },
  ] },
};
// Last visit's scores: Data structures went 30 → 38 (a quiz of 8).
const STORAGE = { 'sx-grades:4821': JSON.stringify({ scores: { 21: 30, 22: 31 }, parts: { 21: { 2: { name: 'შუალედური გამოცდა', v: 30 } } } }) };

module.exports = { BODY, API, NOW, STORAGE, url: '/dashboard' };
