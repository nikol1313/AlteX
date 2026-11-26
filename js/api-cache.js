'use strict';
// Faster sections: the portal's own data requests, answered from memory.
// Runs in the page's world (manifest "world": "MAIN"; the Android app injects everything there), because the portal's
// XMLHttpRequests are only visible from there. Every section waits ~800ms for the server on every visit; with this:
// - a read answered in the last STALE_MS is answered again at once from memory, and refreshed in the background,
//   so the next visit is current again;
// - pointing at (or pressing) a link to another section fetches that section's reads ahead, so by the click they are
//   in memory (the reads of each section are learnt as the portal makes them);
// - anything that changes data (a POST that is not a get…/check… read) empties the memory, so a save or a logout
//   is never followed by old data.
// - offline, a read is answered from memory however old, so sections still open with the last data: at once when
//   navigator.onLine is false, and after the request fails when the connection only looks up; a change tried offline
//   never reached the server, so it keeps the memory;
// - the Android app, after logging in, opens every section once in a hidden frame (WARM), so the portal's own code
//   makes all its reads and they are saved for offline use, not only the sections the student visited.
// Reads only ever go to the portal itself, with the headers the portal sent. Kept in this tab's sessionStorage, so a
// reload keeps it and closing the tab drops it; the Android app (window.__altexApp) keeps it in localStorage for up to
// KEEP_MS, so the app opens with the last data offline. Log out ('sx-forget', js/login.js) empties it. Any failure here
// falls back to the portal's normal request.
(() => {
  if (window.__altexCache) return;
  window.__altexCache = true;
  // A frame of the portal (the warm-up below) uses the top page's memory: one owner, so the two copies never
  // overwrite each other in storage.
  try { if (window !== top && top.__altexCacheFor) { top.__altexCacheFor(window); return; } } catch { /* other origin */ }
  const FRESH_MS = 10 * 1000; // younger than this: no refresh needed
  const STALE_MS = 5 * 60 * 1000; // older than this: not answered from memory
  const KEEP_MS = 7 * 24 * 3600 * 1000; // saved data older than this is dropped
  const MAX = 300;
  const SAVE_KEY = 'sx-api-cache';
  // Last path segment of a portal read sent as a POST: getItems, checkX, isStudentBannedOrPaused, allSelectablePrograms,
  // lang/list. Paged lists (/tasks/?page=…) are reads too.
  const READ = /^(?:[gG]et|[cC]heck|is[A-Z]|all[A-Z]|list$)/;
  // Marks something seen or read: it changes nothing a read shows, so it neither empties the memory nor is kept or
  // repeated (a GET /task/markAsReadTasks must not be fetched ahead).
  const SEEN = /seen|markAsRead/i;
  const SKIP = /download|file|print|pdf|export|logout/i;

  const realFetch = window.fetch.bind(window);
  // key -> { at, status, statusText, headers, body, url, req, section }: req is the portal's request, so the read can
  // be repeated, and section the page that made it, so it can be fetched ahead from a link to that page.
  const cache = new Map();
  const inflight = new Map(); // key -> Promise<entry | null>

  let keep = null;
  try { keep = window.__altexApp ? localStorage : sessionStorage; } catch { /* storage blocked */ }
  try { for (const [k, v] of JSON.parse(keep.getItem(SAVE_KEY) || '[]')) if (Date.now() - v.at < KEEP_MS) cache.set(k, v); } catch { /* none */ }
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!keep) return;
      // Storage full: the oldest reads go first, rather than the whole offline copy.
      for (;;) {
        try { keep.setItem(SAVE_KEY, JSON.stringify([...cache])); return; } catch { /* full or blocked */ }
        if (!cache.size) { try { keep.removeItem(SAVE_KEY); } catch { /* blocked */ } return; }
        for (const k of [...cache.keys()].slice(0, 10)) cache.delete(k);
      }
    }, 500);
  };
  const forget = () => { cache.clear(); inflight.clear(); save(); };
  const put = (key, entry) => {
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    save();
  };

  const sectionOf = (path) => '/' + (path.split('/')[1] || '');
  // What a request is: 'read' (cache it), 'write' (empty the cache) or null (leave it alone).
  const kindOf = (method, url) => {
    if (url.origin !== location.origin || !url.pathname.startsWith('/student/')) return null;
    if (SKIP.test(url.pathname)) return method === 'GET' ? null : 'write';
    if (SEEN.test(url.pathname)) return null;
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    if (method === 'GET' || (method === 'POST' && (READ.test(last) || url.searchParams.has('page')))) return 'read';
    return 'write';
  };
  const keyOf = (r) => `${r.method} ${r.url}\n${r.body || ''}\n${r.headers.authorization || r.headers.Authorization || ''}`;
  const usable = (e) => e && Date.now() - e.at < STALE_MS;

  // One background read with the portal's own request, stored when it is a plain JSON success. Resolves to the entry,
  // null when the server answered something else, or undefined when the network failed.
  const refresh = (key, r, section) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = realFetch(r.url, { method: r.method, headers: r.headers, body: r.method === 'GET' ? undefined : r.body, credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (res.status !== 200 || !/json/i.test(res.headers.get('content-type') || '')) return null;
        const headers = [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n');
        const entry = { at: Date.now(), status: 200, statusText: res.statusText || 'OK', headers, body: await res.text(), url: res.url, req: r, section };
        if (inflight.get(key) === p) put(key, entry);
        return entry;
      })
      .catch(() => undefined)
      .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
  };

  // Answers an opened request from memory the way a finished XMLHttpRequest looks to the portal (Angular's HttpClient).
  const answer = (xhr, e) => {
    const head = Object.fromEntries(e.headers.trim().split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')).trim().toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
    const json = () => { try { return JSON.parse(e.body); } catch { return null; } };
    const props = {
      readyState: 4, status: e.status, statusText: e.statusText, responseURL: e.url, responseText: e.body,
      response: xhr.responseType === 'json' ? json() : e.body,
    };
    for (const [k, v] of Object.entries(props)) Object.defineProperty(xhr, k, { value: v, configurable: true });
    Object.defineProperty(xhr, 'getAllResponseHeaders', { value: () => e.headers, configurable: true });
    Object.defineProperty(xhr, 'getResponseHeader', { value: (n) => head[String(n).toLowerCase()] ?? null, configurable: true });
    setTimeout(() => {
      const size = { lengthComputable: true, loaded: e.body.length, total: e.body.length };
      for (const type of ['readystatechange', 'progress', 'load', 'loadend']) {
        xhr.dispatchEvent(type === 'readystatechange' ? new Event(type) : new ProgressEvent(type, size));
      }
    }, 0);
  };

  // Patches one window's XMLHttpRequest: this page's, or a portal frame's (frame: true), which share the memory above.
  const install = (w, frame) => {
    const X = w.XMLHttpRequest.prototype;
    const open = X.open, send = X.send, setHeader = X.setRequestHeader;
    const reqs = new WeakMap();
    X.open = function (method, url, ...rest) {
      try { reqs.set(this, { method: String(method).toUpperCase(), url: new URL(url, w.location.href).href, headers: {} }); } catch { reqs.delete(this); }
      return open.call(this, method, url, ...rest);
    };
    X.setRequestHeader = function (name, value) {
      const r = reqs.get(this);
      if (r) r.headers[name] = value;
      return setHeader.call(this, name, value);
    };

    // <html data-sx-waiting> while the portal waits on its server: the section-switch spinner shows only then
    // (base.css), not while a section that already has its data is still settling. The warm-up reads it too.
    let waiting = 0;
    const wait = (d) => {
      waiting = Math.max(0, waiting + d);
      const root = w.document.documentElement;
      if (waiting) root.dataset.sxWaiting = ''; else delete root.dataset.sxWaiting;
    };

    X.send = function (body) {
      const r = reqs.get(this);
      let kind = null;
      try { if (r) kind = kindOf(r.method, new URL(r.url)); } catch { kind = null; }
      if (kind) { wait(1); this.addEventListener('loadend', () => wait(-1), { once: true }); }
      if (kind === 'write') {
        if (frame) stopWarm(true); // the warm-up only reads: a section that changes something ends it
        if (navigator.onLine) forget();
      }
      if (kind !== 'read' || (body != null && typeof body !== 'string') || !['', 'text', 'json'].includes(this.responseType)) {
        return send.call(this, body);
      }
      r.body = body == null ? '' : body;
      const key = keyOf(r);
      const section = sectionOf(w.location.pathname);
      const req = { method: r.method, url: r.url, headers: { ...r.headers }, body: r.body };
      if (!frame) warmLater(req.headers.authorization || req.headers.Authorization);

      const hit = cache.get(key);
      const online = navigator.onLine;
      if (usable(hit) || (hit && !online)) {
        try {
          answer(this, hit);
          if (online && Date.now() - hit.at > FRESH_MS) refresh(key, req, section);
          return undefined;
        } catch { /* fall through to the server */ }
      }
      const pending = inflight.get(key);
      if (pending) { // already on its way (fetched ahead, or asked twice): use that answer instead of asking again
        pending.then((e) => {
          if (this.readyState !== 1) return;
          if (e) answer(this, e); else if (e === undefined && hit) answer(this, hit); else send.call(this, body);
        });
        return undefined;
      }
      if (hit) {
        // Too old to show at once: ask the server, and when the network fails (offline, or a connection that only
        // looks up) show the saved answer instead of an empty section. Any other answer reaches the portal as it is.
        refresh(key, req, section).then((e) => {
          if (this.readyState !== 1) return;
          if (e) answer(this, e); else if (e === undefined) answer(this, hit); else send.call(this, body);
        });
        return undefined;
      }
      // The same read asked again while this one is on its way (a quick back-and-forth) waits for this answer.
      let done;
      const mine = new Promise((resolve) => { done = resolve; });
      inflight.set(key, mine);
      this.addEventListener('loadend', () => {
        let entry = null;
        try {
          if (this.status === 200 && /json/i.test(this.getResponseHeader('content-type') || '')) {
            const text = this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText;
            entry = { at: Date.now(), status: 200, statusText: this.statusText || 'OK', headers: this.getAllResponseHeaders(), body: text, url: this.responseURL, req, section };
            if (inflight.get(key) === mine) put(key, entry);
          }
        } catch { entry = null; }
        if (inflight.get(key) === mine) inflight.delete(key);
        done(entry);
      });
      return send.call(this, body);
    };
  };

  // Android app: after logging in, every section once in a hidden frame of the portal, one after another, so their
  // reads are saved for offline use. Once per login token (WARM_KEY), WARM_DELAY_MS after the first signed-in read so
  // the student's own screen loads first. Only sections that just show data: messages and announcements stay out, as
  // opening them can mark them read.
  const WARM = ['/learningCard', '/tables', '/tasks-books', '/tables/learningTables', '/calendar', '/programs',
    '/finances', '/registration', '/chancellery', '/personal-data', '/contracts', '/gegma-documents', '/commands',
    '/dashboard'];
  const WARM_KEY = 'sx-warmed';
  const WARM_DELAY_MS = 5000;
  const QUIET_MS = 1500; // a section is done when no read has waited on the server for this long
  const SECTION_MAX_MS = 20000;
  let warmFor = null;
  let warming = null; // { frame, auth }
  const stopWarm = (done) => {
    if (!warming) return;
    if (done) { try { localStorage.setItem(WARM_KEY, warming.auth.slice(-24)); } catch { /* storage blocked */ } }
    warming.frame.remove();
    warming = null;
  };
  const settle = (frame) => new Promise((resolve) => {
    const start = Date.now();
    let quiet = start;
    const tick = () => {
      if (!warming || warming.frame !== frame) { resolve(); return; }
      let busy = true;
      try { busy = frame.contentDocument.documentElement.hasAttribute('data-sx-waiting'); } catch { /* not loaded yet */ }
      const now = Date.now();
      if (busy) quiet = now;
      if (now - quiet >= QUIET_MS || now - start >= SECTION_MAX_MS) resolve(); else setTimeout(tick, 250);
    };
    tick();
  });
  // A learning card subject opens with its own read (POST /student/getCardDetails {resultId}), made only when it is
  // tapped: asked here for every subject on the saved card, exactly as the portal asks, three at a time.
  const warmSubjects = async (auth) => {
    const sameAuth = (e) => (e.req.headers.authorization || e.req.headers.Authorization) === auth;
    const card = [...cache.values()].find((e) => e.req && e.req.method === 'GET' && sameAuth(e) && new URL(e.req.url).pathname === '/student/card');
    let books = [];
    try { books = (JSON.parse(card.body).card.books || []).filter((b) => b && b.id != null); } catch { return; }
    const url = new URL('/student/getCardDetails', location.origin).href;
    const headers = { ...card.req.headers, 'Content-Type': 'application/json' };
    for (let i = 0; i < books.length; i += 3) {
      if (!warming) return; // logged out meanwhile
      await Promise.all(books.slice(i, i + 3).map((b) => {
        const r = { method: 'POST', url, headers, body: JSON.stringify({ resultId: b.id }) };
        return refresh(keyOf(r), r, '/learningCard');
      }));
    }
  };
  const warmUp = async (auth) => {
    if (warming || !navigator.onLine || !document.body) return;
    try { if (localStorage.getItem(WARM_KEY) === auth.slice(-24)) return; } catch { return; }
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:800px;border:0;visibility:hidden;pointer-events:none';
    warming = { frame, auth };
    const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    frame.src = WARM[0];
    document.body.append(frame);
    await loaded;
    for (const [i, path] of WARM.entries()) {
      if (!warming || warming.frame !== frame) return;
      if (i) { // the portal's own router moves on: no new page load
        try {
          frame.contentWindow.history.pushState(null, '', path);
          frame.contentWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        } catch { break; }
      }
      await settle(frame);
      if (path === '/learningCard' && warming && warming.frame === frame) await warmSubjects(auth);
    }
    if (warming && warming.frame === frame) stopWarm(true);
  };
  const warmLater = (auth) => {
    if (!auth || auth === warmFor || !window.__altexApp) return;
    warmFor = auth;
    setTimeout(() => warmUp(auth), WARM_DELAY_MS);
  };

  install(window, false);
  window.__altexCacheFor = (w) => { try { install(w, true); } catch { /* frame gone */ } };

  // Fetch a section's reads ahead when its link is pointed at or pressed (a press comes ~100ms before the click).
  const ahead = (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    const href = a && a.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    const section = sectionOf(href);
    if (section === sectionOf(location.pathname)) return;
    for (const [key, hit] of cache) if (hit.section === section && Date.now() - hit.at > FRESH_MS) refresh(key, hit.req, section);
  };
  // A DOM event, so js/login.js reaches it from the extension's own world too.
  document.addEventListener('sx-forget', () => { stopWarm(false); forget(); });
  document.addEventListener('pointerover', ahead, { passive: true, capture: true });
  document.addEventListener('pointerdown', ahead, { passive: true, capture: true });
})();
