'use strict';
let queued = false, lastRun = 0, passCost = 0;
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
  passCost = performance.now() - lastRun;
  if (PERF) performance.measure('altex:pass', { start: lastRun });
};
const runPass = () => {
  // Page flags on <html> (a :has() there would rescan the whole DOM on every style recalc).
  for (const [cls, sel] of PAGE_FLAGS) root.classList.toggle(cls, !!document.querySelector(sel));
  maybeWelcome();
  tagCounts();
  dismissNotice();
  mountUserMenu();
  mountThemeToggle();
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
  enhancePhotos();
  tagBlankProfileCells();
  tagProfileStats();
  enhanceTasks();
  labelTableCells();
  labelIconButtons();
  mountExamStrip();
  mountHello();
  mountLogin();
  mountRemember();
  releaseScrollLock();
  if (document.querySelector('dashboard-component a.dashboard-item-wrapper')) { render(); load(); }
};

// A pass runs in requestAnimationFrame: the portal's new markup and AlteX's changes to it reach the screen in the
// same frame, so nothing jumps (CLS) and no section shows the portal's own look first.
// How soon the next one may follow depends on what the last one cost: passes may take about a sixth of the time.
// A pass is 1-5ms on a laptop, so there it follows the portal frame by frame; a slow phone gets a longer gap, at
// most PASS_GAP. (A fixed 200/400ms gap left freshly loaded content in the portal's styling for that long.)
// Hidden tabs get no frames; the pending pass then runs when the tab is shown again.
const PASS_GAP = matchMedia('(pointer: coarse)').matches ? 400 : 200;
const schedule = () => {
  if (queued) return;
  queued = true;
  const wait = Math.min(PASS_GAP, passCost * 6) - (performance.now() - lastRun);
  if (wait <= 0) requestAnimationFrame(run); else setTimeout(() => requestAnimationFrame(run), wait);
};

const start = () => {
  run();
  new MutationObserver(() => { onCardMutation(); schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(schedule, 60 * 1000);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
