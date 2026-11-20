'use strict';
// Applications calendar: each event cell is tagged with its day; CSS turns the week table into a list.
const enhanceCalendar = () => {
  const table = document.querySelector('hr-calendar-component .calendar table');
  if (!table) return;
  const days = [...table.querySelectorAll('thead th.headInfo')].map((th) => ({
    name: (th.querySelector('.day-name.desktop') || th.querySelector('.day-name'))?.textContent.trim() || '',
    number: th.querySelector('.day-number')?.textContent.trim() || '',
    now: th.classList.contains('now'),
  }));
  let events = 0;
  for (const tr of table.querySelectorAll('tbody tr')) {
    [...tr.querySelectorAll(':scope > td.week_tbody_td')].forEach((td, i) => {
      const has = !!td.querySelector('.event');
      if (has) events++;
      const label = has && days[i] ? `${days[i].name} ${days[i].number}` : '';
      if ((td.dataset.sxDay || '') !== label) { if (label) td.dataset.sxDay = label; else delete td.dataset.sxDay; }
      td.classList.toggle('sx-cal-today', has && !!days[i]?.now);
    });
  }
  const wrap = table.parentElement;
  const empty = wrap.querySelector(':scope > .sx-empty');
  if (!events && !empty) {
    const e = el('div', 'sx-empty');
    e.append(el('span', null, 'ამ კვირაში ღონისძიება არ არის'), el('span', null, 'No events this week'));
    wrap.append(e);
  } else if (events && empty) empty.remove();
};

// E-office history: status cells get a tone.
const CHANCELLERY_STATUS = { 'მუშავდება': 'current', 'უარყოფილი': 'cancel', 'შესრულებული': 'success' };
const enhanceChancellery = () => {
  for (const cell of document.querySelectorAll('app-chancellery mat-cell.mat-column-status')) {
    const t = cell.textContent.trim();
    const st = CHANCELLERY_STATUS[t] || (/შესრულ/.test(t) ? 'success' : /უარ/.test(t) ? 'cancel' : t ? 'current' : '');
    if (cell.dataset.sxSt !== st) cell.dataset.sxSt = st;
  }
};
