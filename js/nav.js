'use strict';
// Route through the site's own link when there is one, else via history (Angular follows popstate).
// Some tiles only work from the dashboard (the academic calendar is a PDF the tile opens): go there, then tap it.
const DASH_ONLY = new Set(['/academic-calendar']);
let dashTap = null;
const go = (href) => {
  const a = document.querySelector(`.topMenuItem > a[href="${href}"]:not([data-sx-href]), a.dashboard-item-wrapper[href="${href}"], a.user-area[href="${href}"]`);
  if (a) { a.click(); return; }
  if (DASH_ONLY.has(href)) { dashTap = { href, at: Date.now() }; go('/dashboard'); return; }
  history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
};

const tapDashOnly = () => {
  if (!dashTap) return;
  if (Date.now() - dashTap.at > 8000) { dashTap = null; return; }
  const a = document.querySelector(`a.dashboard-item-wrapper[href="${dashTap.href}"]`);
  if (a) { dashTap = null; a.click(); }
};

// The portal's notification popup ("ნახვა") opens on every visit: close it at once, like Material does on Escape.
// css/base.css keeps it hidden meanwhile so it never flashes.
const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
const dismissNotice = () => {
  for (const dialog of document.querySelectorAll('alert-dialog:not([data-sx-closed])')) {
    if (!/ნახვა/.test(dialog.querySelector('.mat-mdc-dialog-actions button')?.textContent || '')) continue;
    dialog.dataset.sxClosed = '';
    document.body.dispatchEvent(new KeyboardEvent('keydown', ESCAPE));
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
// A popover anchored to its button: the browser keeps it in the top layer (never clipped by the scrollable bar),
// places it under the button, and closes it on Esc or a click outside.
const buildMore = () => {
  const li = el('li', 'sx-more');
  const btn = el('button', 'sx-more-btn', 'მეტი');
  btn.type = 'button';
  btn.setAttribute('popovertarget', 'sx-more-menu'); // not commandfor: Android WebViews before 135 ignore it
  const menu = el('div', 'sx-more-menu');
  menu.id = 'sx-more-menu';
  menu.popover = 'auto';
  menu.append(...NAV_MORE.map(({ href, ka, en }) => {
    const a = el('a', 'sx-more-item');
    a.href = href;
    a.append(el('span', 'sx-ka', ka), el('span', 'sx-en', en));
    return a;
  }));
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.sx-more-item');
    if (!item || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // new tab / window: let the link work
    e.preventDefault();
    menu.hidePopover();
    go(item.getAttribute('href'));
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
    const href = item.getAttribute('href');
    const active = path === href || path.startsWith(href + '/');
    any = any || active;
    if (active !== item.hasAttribute('aria-current')) { if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
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
        // In-app navigation: a full reload made the portal show its notification popup again.
        go('/personal-data');
      }, true);
    } else if (/გასვლა/.test(t)) {
      a.dataset.en = 'Log out';
      a.classList.add('sx-um-logout');
      a.addEventListener('click', forgetLogin, true);
    }
  }
};


// Phones: a menu button in the header opens every section as a full-screen list (CSS hides the bar).
const NAV_DRAWER = [
  ['მთავარი', [
    { href: '/dashboard', ka: 'მთავარი', en: 'Home' },
    { href: '/tables', ka: 'ცხრილი', en: 'Schedule' },
    { href: '/learningCard', ka: 'სასწავლო ბარათი', en: 'Learning card' },
    { href: '/tasks-books', ka: 'დავალებები', en: 'Assignments' },
    { href: '/calendar', ka: 'განცხადებები', en: 'Announcements' },
    { href: '/registration', ka: 'აკადემიური რეგისტრაცია', en: 'Registration' },
    { href: '/programs', ka: 'საგანმანათლებლო პროგრამა', en: 'Programme' },
    { href: '/finances', ka: 'ფინანსები', en: 'Finances' },
    { href: '/chancellery', ka: 'ელ. კანცელარია', en: 'E-office' },
    { href: '/personal-data', ka: 'პირადი მონაცემები', en: 'Personal data' },
  ]],
  ['მეტი', NAV_MORE],
];
const navBadge = (href) => [...document.querySelectorAll(`:is(.topMenuItem > a, a.dashboard-item-wrapper)[href="${href}"] :is(.notify, .mat-badge-content)`)]
  .map((b) => b.textContent.trim()).find((t) => /^\d+$/.test(t) && t !== '0') || '';
// A modal <dialog>: the browser moves focus in, makes the page behind inert, closes it on Esc or the Android back
// gesture, and returns focus to the menu button.
const setDrawer = (open) => {
  const drawer = document.querySelector('.sx-drawer');
  if (!drawer || drawer.open === open) return;
  if (open) { fillDrawer(drawer); drawer.showModal(); } else drawer.close();
  syncDrawer();
};
// The scroll lock and the button state follow the dialog, however it was closed.
const syncDrawer = () => {
  const open = !!document.querySelector('.sx-drawer')?.open;
  if (root.classList.contains('sx-drawer-open') !== open) root.classList.toggle('sx-drawer-open', open);
  document.querySelector('.sx-nav-btn')?.setAttribute('aria-expanded', String(open));
};
const fillDrawer = (drawer) => {
  const path = location.pathname;
  const head = el('div', 'sx-drawer-head');
  const brand = el('span', 'sx-drawer-brand', 'Alte');
  brand.append(el('b', null, 'X'));
  const close = el('button', 'sx-drawer-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'დახურვა / Close');
  close.addEventListener('click', () => setDrawer(false));
  head.append(brand, close);
  const nav = el('nav', 'sx-drawer-nav');
  nav.setAttribute('aria-label', 'მენიუ / Menu');
  nav.append(...NAV_DRAWER.flatMap(([label, items]) => [el('span', 'sx-drawer-label', label), ...items.map(({ href, ka, en }) => {
    const b = el('a', 'sx-drawer-item');
    b.href = href;
    if (path === href || path.startsWith(href + '/')) b.setAttribute('aria-current', 'page');
    const text = el('span', 'sx-drawer-text');
    text.append(el('span', 'sx-ka', ka), el('span', 'sx-en', en));
    b.append(text);
    const badge = navBadge(href);
    if (badge) b.append(el('span', 'sx-drawer-badge', badge));
    return b;
  })]));
  drawer.replaceChildren(head, nav);
};
const mountDrawer = () => {
  const area = document.querySelector('user-menu-component .user-area');
  if (!area) { setDrawer(false); return; }
  if (!area.querySelector(':scope > .sx-nav-btn')) {
    const btn = el('button', 'sx-nav-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'მენიუ / Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.append(el('span', 'sx-burger'));
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setDrawer(true); });
    area.prepend(btn);
  }
  if (!document.querySelector('.sx-drawer')) {
    const drawer = el('dialog', 'sx-drawer');
    drawer.setAttribute('aria-label', 'მენიუ / Menu');
    drawer.addEventListener('close', syncDrawer);
    drawer.addEventListener('click', (e) => {
      const item = e.target.closest('.sx-drawer-item');
      if (!item) return;
      e.preventDefault();
      setDrawer(false);
      go(item.getAttribute('href'));
    });
    document.body.append(drawer);
  }
};
window.addEventListener('popstate', () => setDrawer(false));

// Phones: plain tables become one card per row (CSS); each cell carries its column title.
const CARD_TABLES = ':is(student-commands-component, app-statement-list, student-logs-component, list-bib-component) mat-table';
const labelTableCells = () => {
  for (const t of document.querySelectorAll(CARD_TABLES)) {
    if (!t.classList.contains('sx-cards')) t.classList.add('sx-cards');
    const titles = {};
    for (const h of t.querySelectorAll('mat-header-cell')) {
      const col = [...h.classList].find((c) => c.startsWith('mat-column-'));
      if (col) titles[col] = h.textContent.trim();
    }
    for (const c of t.querySelectorAll('mat-cell')) {
      const label = titles[[...c.classList].find((x) => x.startsWith('mat-column-'))] || '';
      if (c.dataset.label !== label) c.dataset.label = label;
    }
  }
};

// Offline: a notice while the connection is gone (otherwise taps just seem to do nothing).
const setOffline = () => {
  const off = !navigator.onLine;
  let note = document.querySelector('.sx-offline');
  if (off && !note && document.body) {
    note = el('div', 'sx-offline', 'ინტერნეტთან კავშირი არ არის · Offline');
    note.setAttribute('role', 'status');
    document.body.append(note);
  } else if (!off && note) note.remove();
};
window.addEventListener('offline', setOffline);
window.addEventListener('online', setOffline);

// Icon-only buttons get a spoken name (screen readers otherwise say just "button").
const ICON_NAMES = {
  visibility: 'ნახვა', download: 'ჩამოტვირთვა', cloud_download: 'ჩამოტვირთვა', file_download: 'ჩამოტვირთვა',
  fact_check: 'სილაბუსი', info: 'ინფორმაცია', bookmark: 'შენახვა', bookmark_border: 'შენახვა', menu_book: 'წაკითხვა',
  attach_file: 'ფაილი', delete: 'წაშლა', edit: 'რედაქტირება', close: 'დახურვა', search: 'ძიება', add: 'დამატება',
  print: 'ბეჭდვა', keyboard_arrow_down: 'გაშლა', keyboard_arrow_up: 'აკეცვა', expand_more: 'გაშლა', expand_less: 'აკეცვა',
  chevron_left: 'წინა', chevron_right: 'შემდეგი', navigate_before: 'წინა', navigate_next: 'შემდეგი', refresh: 'განახლება',
  calendar_today: 'კალენდარი', event: 'კალენდარი', list: 'სია', list_alt: 'სია', comment: 'კომენტარი', send: 'გაგზავნა',
};
const labelIconButtons = () => {
  for (const b of document.querySelectorAll('button:not([aria-label]):not([aria-labelledby]), a[href]:not([aria-label]):has(> mat-icon:only-child)')) {
    const icon = b.querySelector('mat-icon, .material-icons');
    if (!icon) continue;
    const name = icon.textContent.trim();
    if (!name || b.textContent.trim() !== name) continue; // has visible text of its own
    b.setAttribute('aria-label', ICON_NAMES[name] || name.replace(/_/g, ' '));
  }
};
