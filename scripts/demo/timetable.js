// Demo timetable: the portal's week as .headInfo day blocks of "<b>label</b>: value<br>" lessons, which AlteX turns
// into lesson cards, plus the tab rail it folds to the left.
const { page } = require('./shell');

// Wednesday 18 November 2026, 12:20: the 9:30 lecture is over, the 12:00 one is running.
const NOW = '2026-11-18T12:20:00+04:00';

const lesson = (time, course, lecturer, room, type = 'ლექცია/სემინარი', duration = 90) =>
  `<div class="day-item"><b>საათი</b>: ${time}<br><b>სასწ.კურსი</b>: ${course}<br><b>ლექტორი</b>: ${lecturer}<br><b>აუდიტორია</b>: ${room}<br><b>ტიპი</b>: ${type}<br><b>ხანგრძლივობა</b>: ${duration}<br></div>`;
const DAYS = [
  ['ორშაბათი', 16, [lesson('10:00', 'მონაცემთა სტრუქტურები', 'ნინო კვარაცხელია', '305'), lesson('14:30', 'ხელოვნური ინტელექტი', 'დავით ლომიძე', '204')]],
  ['სამშაბათი', 17, [lesson('11:00', 'ალბათობა და სტატისტიკა', 'თამარ გელაშვილი', '112')]],
  ['ოთხშაბათი', 18, [lesson('09:30', 'ვებ-ტექნოლოგიები', 'ლევან ჩიქოვანი', '410'), lesson('12:00', 'მონაცემთა სტრუქტურები', 'ნინო კვარაცხელია', '305', 'პრაქტიკული'), lesson('15:00', 'ინგლისური ენა B2', 'ანა მესხი', '018', 'სემინარი', 60)]],
  ['ხუთშაბათი', 19, [lesson('13:00', 'ხელოვნური ინტელექტი', 'დავით ლომიძე', '204', 'ლაბორატორია')]],
  ['პარასკევი', 20, [lesson('10:00', 'ოპერაციული სისტემები', 'გიორგი ნადირაძე', '307'), lesson('12:30', 'ალბათობა და სტატისტიკა', 'თამარ გელაშვილი', '112', 'სემინარი')]],
  ['შაბათი', 21, []],
  ['კვირა', 22, []],
];
const day = ([name, n, lessons], i) => `<div class="headInfo${i === 2 ? ' now' : ''}">
  <button class="day-title mat-mdc-button"><span class="mdc-button__label"><div class="day-number"><div>${n}</div></div><div class="day-name">${name}</div></span></button>
  <div class="weeklist">${lessons.join('')}</div>
</div>`;

const TABS = [['/tables/learningTables', 'ლექციები'], ['/tables/ac-tables/1', 'შუალედური'], ['/tables/ac-tables/2', 'შუალედურის გადაბარება'], ['/tables/ac-tables/3', 'დასკვნითი'], ['/tables/ac-tables/4', 'დასკვნითის გადაბარება'], ['/tables/ac-tables/quizzes', 'ქვიზები']];
const BODY = page(`<tables-dashboard-component><div class="width">
  <div class="tables-dashboard"><ul class="tables-tab-menu">${TABS.map(([href, t], i) => `<li><a href="${href}"${i ? '' : ' class="active"'}>${t}</a></li>`).join('')}</ul></div>
  <student-tables-component><div><div class="calendar">
    <div class="calendar-navigation"><button class="mat-mdc-button">‹</button><div class="monthName">16 – 22 ნოემბერი</div><button class="mat-mdc-button">›</button></div>
    <div class="weeklist-container">${DAYS.map(day).join('')}</div>
  </div></div></student-tables-component>
</div></tables-dashboard-component>`);

module.exports = { BODY, NOW, url: '/tables/learningTables' };
