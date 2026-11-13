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

// Profiling aid: localStorage.setItem('sx-perf', '1') puts every pass on the DevTools Performance "Timings" track.
const PERF = store.get('sx-perf') === '1';
const run = () => {
  queued = false;
  lastRun = performance.now();
  runPass();
  if (PERF) performance.measure('altex:pass', { start: lastRun });
};
const runPass = () => {
  // Page flags on <html> (a :has() there would rescan the whole DOM on every style recalc).
  for (const [cls, sel] of PAGE_FLAGS) root.classList.toggle(cls, !!document.querySelector(sel));
  maybeWelcome();
  tagCounts();
  dismissNotice();
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
  if (document.querySelector('dashboard-component a.dashboard-item-wrapper')) { render(); load(); }
};

// At most ~5 passes a second (~2.5 on phones, where each pass costs more). A pass runs in requestAnimationFrame:
// the portal's new markup and AlteX's changes to it reach the screen in the same frame, so nothing jumps (CLS).
// Hidden tabs get no frames; the pending pass then runs when the tab is shown again.
const PASS_GAP = matchMedia('(pointer: coarse)').matches ? 400 : 200;
const schedule = () => {
  if (queued) return;
  queued = true;
  const wait = PASS_GAP - (performance.now() - lastRun);
  if (wait <= 0) requestAnimationFrame(run); else setTimeout(() => requestAnimationFrame(run), wait);
};

const start = () => {
  run();
  new MutationObserver(() => { onCardMutation(); schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(schedule, 60 * 1000);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
