'use strict';
let queued = false, lastRun = 0;
const PAGE_FLAGS = [['sx-dash', 'dashboard-component'], ['sx-tables', 'student-tables-component'], ['sx-ttdash', 'tables-dashboard-component'], ['sx-program', 'program-view']];

const tagCounts = () => {
  for (const c of document.querySelectorAll('.notify, .mat-badge-content')) {
    const zero = c.textContent.trim() === '0';
    if (c.hasAttribute('data-sx-zero') !== zero) c.toggleAttribute('data-sx-zero', zero);
  }
  // The site's Result-* classes don't match the letter shown: tag the real letter.
  for (const c of document.querySelectorAll('.result-color')) {
    const g = c.textContent.trim().toUpperCase();
    if (c.dataset.grade !== g) c.dataset.grade = g;
  }
};

const run = () => {
  queued = false;
  lastRun = performance.now();
  // Page flags on <html> (a :has() there would rescan the whole DOM on every style recalc).
  for (const [cls, sel] of PAGE_FLAGS) root.classList.toggle(cls, !!document.querySelector(sel));
  maybeWelcome();
  tagCounts();
  mountIdc();
  mountUserMenu();
  mountDashNav();
  mountNav();
  mountDrawer();
  tapDashOnly();
  mountRail();
  enhanceWeek();
  enhanceExams();
  enhanceCard();
  enhanceEstDialog();
  enhanceCardHeader();
  enhanceFinances();
  enhanceCalendar();
  enhanceChancellery();
  enhanceTablesLoading();
  enhanceRegistration();
  enhanceTasks();
  labelTableCells();
  labelIconButtons();
  mountExamStrip();
  mountHello();
  mountLogin();
  mountRemember();
  goStatementList();
  if (document.querySelector('dashboard-component a.dashboard-item-wrapper')) { render(); load(); }
};

// The portal mutates the DOM constantly: at most ~5 passes a second (~2.5 on phones, where each pass costs more).
const PASS_GAP = matchMedia('(pointer: coarse)').matches ? 400 : 200;
const schedule = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { if (document.hidden) { queued = false; return; } run(); }, Math.max(0, PASS_GAP - (performance.now() - lastRun)));
};

const start = () => {
  run();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(schedule, 60 * 1000);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
