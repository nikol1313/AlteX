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
// Reads only ever go to the portal itself, with the headers the portal sent. Kept in this tab's sessionStorage, so a
// reload (the Android app reloads on return) keeps it and closing the tab drops it. Any failure here falls back to the
// portal's normal request.
(() => {
  if (window.__altexCache) return;
  window.__altexCache = true;
  const FRESH_MS = 10 * 1000; // younger than this: no refresh needed
  const STALE_MS = 5 * 60 * 1000; // older than this: not answered from memory
  const KEEP_MS = 7 * 24 * 3600 * 1000; // saved data older than this is dropped
  const MAX = 80;
  const SAVE_KEY = 'sx-api-cache';
  const READ = /^(get|check)/i; // last path segment of a portal read: getItems, getMetaNew, check…
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
      try { keep.setItem(SAVE_KEY, JSON.stringify([...cache])); } catch { try { keep.removeItem(SAVE_KEY); } catch { /* blocked */ } }
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
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    if (method === 'GET' || (method === 'POST' && READ.test(last))) return 'read';
    return 'write';
  };
  const keyOf = (r) => `${r.method} ${r.url}\n${r.body || ''}\n${r.headers.authorization || r.headers.Authorization || ''}`;
  const usable = (e) => e && Date.now() - e.at < STALE_MS;

  // One background read with the portal's own request, stored when it is a plain JSON success.
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
      .catch(() => null)
      .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
  };

  const X = XMLHttpRequest.prototype;
  const open = X.open, send = X.send, setHeader = X.setRequestHeader;
  const reqs = new WeakMap();
  X.open = function (method, url, ...rest) {
    try { reqs.set(this, { method: String(method).toUpperCase(), url: new URL(url, location.href).href, headers: {} }); } catch { reqs.delete(this); }
    return open.call(this, method, url, ...rest);
  };
  X.setRequestHeader = function (name, value) {
    const r = reqs.get(this);
    if (r) r.headers[name] = value;
    return setHeader.call(this, name, value);
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

  // <html data-sx-waiting> while the portal waits on its server: the section-switch spinner shows only then
  // (base.css), not while a section that already has its data is still settling.
  let waiting = 0;
  const wait = (d) => {
    waiting = Math.max(0, waiting + d);
    if (waiting) document.documentElement.dataset.sxWaiting = ''; else delete document.documentElement.dataset.sxWaiting;
  };

  X.send = function (body) {
    const r = reqs.get(this);
    let kind = null;
    try { if (r) kind = kindOf(r.method, new URL(r.url)); } catch { kind = null; }
    if (kind) { wait(1); this.addEventListener('loadend', () => wait(-1), { once: true }); }
    if (kind === 'write') forget();
    if (kind !== 'read' || (body != null && typeof body !== 'string') || !['', 'text', 'json'].includes(this.responseType)) {
      return send.call(this, body);
    }
    r.body = body == null ? '' : body;
    const key = keyOf(r);
    const section = sectionOf(location.pathname);
    const req = { method: r.method, url: r.url, headers: { ...r.headers }, body: r.body };

    const hit = cache.get(key);
    if (usable(hit)) {
      try {
        answer(this, hit);
        if (Date.now() - hit.at > FRESH_MS) refresh(key, req, section);
        return undefined;
      } catch { /* fall through to the server */ }
    }
    const pending = inflight.get(key);
    if (pending) { // already on its way (fetched ahead, or asked twice): use that answer instead of asking again
      pending.then((e) => { if (e && this.readyState === 1) answer(this, e); else if (this.readyState === 1) send.call(this, body); });
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

  // Fetch a section's reads ahead when its link is pointed at or pressed (a press comes ~100ms before the click).
  const ahead = (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    const href = a && a.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    const section = sectionOf(href);
    if (section === sectionOf(location.pathname)) return;
    for (const [key, hit] of cache) if (hit.section === section && Date.now() - hit.at > FRESH_MS) refresh(key, hit.req, section);
  };
  document.addEventListener('pointerover', ahead, { passive: true, capture: true });
  document.addEventListener('pointerdown', ahead, { passive: true, capture: true });
})();
