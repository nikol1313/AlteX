'use strict';
// Route through the site's own link when there is one, else via history (Angular follows popstate).
const go = (href) => {
  const a = document.querySelector(`.topMenuItem > a[href="${href}"]:not([data-sx-href]), a.dashboard-item-wrapper[href="${href}"], a.user-area[href="${href}"]`);
  if (a) { a.click(); return; }
  history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
};

// "idc" on the notification popup: close it like Material does (Escape) and go home.
const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
let wantStatementList = 0;
const goStatementList = () => {
  if (!wantStatementList) return;
  if (Date.now() - wantStatementList > 15000) { wantStatementList = 0; return; }
  const tab = document.querySelector('a[href="/calendar/statementList"]');
  if (!tab) return;
  wantStatementList = 0;
  if (location.pathname !== '/calendar/statementList') tab.click();
};
const mountIdc = () => {
  for (const actions of document.querySelectorAll('alert-dialog .mat-mdc-dialog-actions')) {
    if (actions.querySelector(':scope > .sx-idc')) continue;
    const view = actions.querySelector('button');
    if (!/ნახვა/.test(view?.textContent || '')) continue;
    view.addEventListener('click', () => { wantStatementList = Date.now(); }, true);
    const btn = el('button', 'sx-idc', 'idc');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', ESCAPE));
      if (location.pathname !== '/dashboard') go('/dashboard');
    });
    actions.append(btn);
  }
};

const NAV_MAIN = ['/calendar', '/registration', '/programs', '/finances', '/chancellery'];
const NAV_MORE = [
  { href: '/lms', ka: 'LMS', en: 'Learning platform' },
  { href: '/academic-calendar', ka: 'აკადემიური კალენდარი', en: 'Academic calendar' },
  { href: '/gegma-documents', ka: 'დოკუმენტები', en: 'Documents' },
  { href: '/bib', ka: 'ბიბლიოთეკა', en: 'Library' },
  { href: '/commands', ka: 'ბრძანებები', en: 'Orders' },
  { href: '/contracts', ka: 'ხელშეკრულება', en: 'Contracts' },
  { href: '/notifications', ka: 'განცხადებები (არქივი)', en: 'Announcements archive' },
  { href: '/logs', ka: 'ლოგები', en: 'Activity log' },
];
const closeMore = () => document.querySelector('.sx-more.sx-open')?.classList.remove('sx-open');
// The dropdown is position: fixed, so the horizontally scrollable bar never clips it.
const placeMore = (li) => {
  const r = li.querySelector('.sx-more-btn').getBoundingClientRect();
  const menu = li.querySelector('.sx-more-menu');
  menu.style.top = `${Math.round(r.bottom + 8)}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 316)))}px`;
};
const buildMore = () => {
  const li = el('li', 'sx-more');
  const btn = el('button', 'sx-more-btn', 'მეტი');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  const menu = el('div', 'sx-more-menu');
  menu.setAttribute('role', 'menu');
  menu.append(...NAV_MORE.map(({ href, ka, en }) => {
    const b = el('button', 'sx-more-item');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.dataset.href = href;
    b.append(el('span', 'sx-ka', ka), el('span', 'sx-en', en));
    return b;
  }));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !li.classList.contains('sx-open');
    li.classList.toggle('sx-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) placeMore(li);
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.sx-more-item');
    if (!item) return;
    closeMore();
    go(item.dataset.href);
  });
  li.append(btn, menu);
  return li;
};
const mountNav = () => {
  const list = document.querySelector('.topMenuItems');
  if (!list) return;
  let li = list.querySelector(':scope > .sx-more');
  if (!li) { li = buildMore(); list.append(li); }
  const path = location.pathname;
  let any = false;
  for (const item of li.querySelectorAll('.sx-more-item')) {
    const active = path === item.dataset.href || path.startsWith(item.dataset.href + '/');
    any = any || active;
    item.classList.toggle('sx-active', active);
  }
  li.classList.toggle('sx-active', any);
};

// The dashboard has no nav bar: build one with the same markup from the dashboard's own links.
const mountDashNav = () => {
  const existing = document.querySelector('.sx-dash-nav');
  if (!document.querySelector('dashboard-component')) { existing?.remove(); return; }
  const host = document.querySelector('user-menu-component .dashboard-page');
  if (!host) return;
  let nav = existing;
  if (!nav) {
    nav = el('div', 'topMenuTo sx-dash-nav');
    const inner = el('div', 'topMenu');
    const width = el('div', 'width');
    const ul = el('ul', 'topMenuItems');
    width.append(ul); inner.append(width); nav.append(inner); host.append(nav);
    ul.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-sx-href]');
      if (!a) return;
      e.preventDefault();
      go(a.dataset.sxHref);
    });
  }
  const ul = nav.querySelector('ul');
  const sources = NAV_MAIN.map((href) => document.querySelector(`a.dashboard-item-wrapper[href="${href}"]`)).filter(Boolean).map((src) => {
    const badge = [...src.querySelectorAll('.notify, .mat-badge-content')].map((b) => b.textContent.trim()).find((t) => /^\d+$/.test(t) && t !== '0') || '';
    return { href: src.getAttribute('href'), title: (src.querySelector('.title') || src).textContent.trim(), badge };
  });
  const key = sources.map((x) => `${x.href}=${x.title}=${x.badge}`).join('|');
  if (ul.dataset.key === key) return;
  ul.dataset.key = key;
  const more = ul.querySelector(':scope > .sx-more');
  ul.replaceChildren(...sources.map(({ href, title, badge }) => {
    const li = el('li', 'topMenuItem');
    const a = el('a');
    a.href = href;
    a.dataset.sxHref = href;
    a.append(el('span', 'menu-text', title));
    if (badge) a.append(el('span', 'notify', badge));
    li.append(a);
    return li;
  }), ...(more ? [more] : []));
};

// The site's user dropdown: "Profile" opens personal data instead.
const mountUserMenu = () => {
  const sub = document.querySelector('.user-subMenu');
  if (!sub || sub.dataset.sxBound) return;
  sub.dataset.sxBound = '1';
  for (const a of sub.querySelectorAll('a')) {
    const t = a.textContent.trim();
    if (/პროფილი/.test(t)) {
      a.dataset.en = 'Profile · პირადი მონაცემები';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        document.querySelector('.user-menu')?.click();
        const link = document.querySelector('.topMenuItem > a[href="/personal-data"]');
        if (link) link.click(); else location.assign('/personal-data');
      }, true);
    } else if (/გასვლა/.test(t)) {
      a.dataset.en = 'Log out';
      a.classList.add('sx-um-logout');
    }
  }
};

document.addEventListener('click', (e) => { if (!e.target.closest('.sx-more')) closeMore(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
window.addEventListener('resize', closeMore);
window.addEventListener('scroll', () => { const li = document.querySelector('.sx-more.sx-open'); if (li) placeMore(li); }, { passive: true });
