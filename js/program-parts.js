'use strict';
// Programme page, page world: the portal's Angular takes ~5ms per course row to build (8 icons, tooltip, syllabus
// button each), so a 100-course programme blocked the page for over half a second. The programme's data is handed
// to Angular one quarter at a time instead: the first quarter on load, the next each time the student asks
// (programs.js, through an 'altex:program-more' event). Angular reads the same arrays it was given, so the next
// quarter is pushed into them inside Angular's zone and the portal renders it itself, syllabus and prerequisites
// included. <html data-sx-program-left> tells the AlteX side how many courses are still to come.
(() => {
  if (window.__altexProgramParts) return;
  window.__altexProgramParts = true;
  const PARTS = 4, MIN_ROWS = 60;
  const parse = JSON.parse;
  let state = null; // { data, all: [{ m, groups }], total, shown, zone }

  const rows = (g) => (g.books || []).length;
  const setLeft = (n) => {
    if (n) document.documentElement.dataset.sxProgramLeft = n;
    else delete document.documentElement.dataset.sxProgramLeft;
  };
  // Rebuilds the arrays Angular holds, in place, with the groups up to `shown` quarters. Cuts only between groups,
  // so a group never shows half its courses.
  const fill = () => {
    const { data, all, total, shown } = state;
    const limit = total * shown / PARTS;
    let before = 0, kept = 0;
    const plan = [];
    for (const { m, groups } of all) {
      const keep = [];
      for (const g of groups) {
        if (before < limit) { keep.push(g); kept += rows(g); }
        before += rows(g);
      }
      if (keep.length || (!groups.length && before < limit)) plan.push([m, keep]);
    }
    // Only now touch the arrays Angular holds, in place (it keeps references to them).
    for (const [m, keep] of plan) if (Array.isArray(m.groups)) m.groups.splice(0, m.groups.length, ...keep);
    data.modules.splice(0, data.modules.length, ...plan.map(([m]) => m));
    setLeft(total - kept);
  };
  // Anything unexpected: the whole programme, as the portal sent it.
  const showAll = () => {
    if (state) {
      for (const { m, groups } of state.all) if (Array.isArray(m.groups)) m.groups.splice(0, m.groups.length, ...groups);
      state.data.modules.splice(0, state.data.modules.length, ...state.all.map((x) => x.m));
    }
    state = null;
    setLeft(0);
  };

  // The portal parses its own responses with JSON.parse inside Angular's zone; only the programme answer is touched.
  JSON.parse = function (text, reviver) {
    const o = parse.call(this, text, reviver);
    try {
      if (o && Array.isArray(o.modules) && o.program && o.special && location.pathname.startsWith('/programs') && typeof Zone === 'function' && Zone.current.name === 'angular') {
        const all = o.modules.map((m) => ({ m, groups: Array.isArray(m.groups) ? m.groups.slice() : [] }));
        const total = all.reduce((n, x) => n + x.groups.reduce((k, g) => k + rows(g), 0), 0);
        state = { data: o, all, total, shown: total < MIN_ROWS ? PARTS : 1, zone: Zone.current };
        fill();
      }
    } catch { showAll(); } // never break the portal's own parsing
    return o;
  };

  document.addEventListener('altex:program-more', () => {
    if (!state || state.shown >= PARTS) return;
    state.shown += 1;
    // Leaving Angular's zone makes it render the arrays again.
    state.zone.run(() => { try { fill(); } catch { showAll(); } });
  });
})();
