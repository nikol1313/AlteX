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
// In order; with sx-perf each one is its own altex:<name> measure.
const PASS_STEPS = [
  maybeWelcome, tagCounts, dismissNotice, mountUserMenu, mountDashNav, mountNav, mountDrawer, tapDashOnly, mountRail, enhanceWeek, enhanceExams, enhanceCard, enhanceEstDialog, enhanceCardHeader, enhanceFinances, enhanceCalendar, enhanceChancellery, enhanceTablesLoading, enhanceRegistration, enhanceProgram, enhancePhotos, tagBlankProfileCells, tagProfileStats, enhanceTasks, labelTableCells, labelIconButtons, mountExamStrip, mountHello, mountLogin, mountRemember, releaseScrollLock,
];
const runPass = () => {
  // Page flags on <html> (a :has() there would rescan the whole DOM on every style recalc).
  for (const [cls, sel] of PAGE_FLAGS) root.classList.toggle(cls, !!document.querySelector(sel));
  for (const step of PASS_STEPS) {
    if (!PERF) { step(); continue; }
    const t = performance.now();
    step();
    performance.measure(`altex:${step.name}`, { start: t });
  }
  if (document.querySelector('dashboard-component a.dashboard-item-wrapper')) { render(); load(); }
};

// A pass runs in requestAnimationFrame: the portal's new markup and AlteX's changes to it reach the screen in the
// same frame, so nothing jumps (CLS) and no section shows the portal's own look first.
// How soon the next one may follow depends on what the last one cost: passes may take about a sixth of the time.
// A pass is 1-5ms on a laptop, so there it follows the portal frame by frame; a slow phone gets a longer gap, at
// most PASS_GAP. (A fixed 200/400ms gap left freshly loaded content in the portal's styling for that long.)
// Hidden tabs get no frames; the pending pass then runs when the tab is shown again.
const PASS_GAP = matchMedia('(pointer: coarse)').matches ? 400 : 200;

// Section switches. The portal swaps the page component under .all-page-container the moment it routes. For the next
// ROUTE_FAST ms passes run frame by frame (no gap), so the new section never shows in the portal's own styling while
// its data comes in. A spinner (base.css) stays until the section stops changing for ROUTE_QUIET ms, at most ROUTE_MAX ms.
const ROUTE_FAST = 1500, ROUTE_QUIET = 250, ROUTE_MAX = 5000;
let routePage, routeAt = -Infinity, routeQuiet = 0;
// Only the first section of a visit plays its entrance animations; every switch after that shows the section at once
// (sx-calm, base.css), as the portal itself does: motion on each switch only made sections feel slower to open.
let routeShown = false;
const routeDone = () => { clearTimeout(routeQuiet); root.classList.remove('sx-routing'); };
const watchRoute = () => {
  const page = document.querySelector('.all-page-container > :not(router-outlet)');
  if (page !== routePage) {
    if (page) {
      if (routeShown && !root.classList.contains('sx-calm')) root.classList.add('sx-calm');
      routeShown = true;
    }
    if (routePage !== undefined && page) { // not the first page of the visit
      routeAt = performance.now();
      if (!document.querySelector('.sx-route-busy')) document.body.append(el('div', 'sx-route-busy'));
      root.classList.add('sx-routing');
    }
    routePage = page;
  }
  if (!root.classList.contains('sx-routing')) return;
  clearTimeout(routeQuiet);
  if (performance.now() - routeAt > ROUTE_MAX) routeDone(); else routeQuiet = setTimeout(routeDone, ROUTE_QUIET);
};

const schedule = () => {
  if (queued) return;
  queued = true;
  const wait = performance.now() - routeAt < ROUTE_FAST ? 0 : Math.min(PASS_GAP, passCost * 6) - (performance.now() - lastRun);
  if (wait <= 0) requestAnimationFrame(run); else setTimeout(() => requestAnimationFrame(run), wait);
};

// Smooth wheel scrolling (Lenis, js/lenis.min.js) for mouse and trackpad. Touch keeps the native scroll (phones, the
// Android app). The page's own inner scroll areas (dialogs, portal menus and popups, the timetable rail) scroll
// natively; reduced motion turns smoothing off. Named here instead of allowNestedScroll, which reads the computed
// style of every element under the pointer on each wheel event.
const LENIS_NATIVE = ['cdk-overlay-container', 'tables-dashboard', 'sx-more-menu'];
const startLenis = () => {
  if (typeof Lenis !== 'function' || !matchMedia('(pointer: fine)').matches) return;
  // Lenis caps scrolling at the page height it last measured, refreshed by a resize watcher with a 250ms delay. That
  // measurement went stale (seen on the student card right after loading): the wheel then moved the page 0px even with
  // room to scroll. Each wheel turn checks the page height first and re-measures when it changed (a cheap read: layout
  // is clean between frames).
  let measured = 0;
  const lenis = new Lenis({ autoRaf: true, stopInertiaOnNavigate: true,
    prevent: (node) => node.nodeName === 'DIALOG' || LENIS_NATIVE.some((c) => node.classList?.contains(c)),
    virtualScroll: () => {
      const h = document.documentElement.scrollHeight;
      if (h !== measured) { measured = h; lenis.resize(); }
      return true;
    } });
};

const start = () => {
  run();
  startLenis();
  new MutationObserver(() => { onCardMutation(); watchRoute(); schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(schedule, 60 * 1000);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
