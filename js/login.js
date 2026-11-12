'use strict';
// Login page: brand panel beside the site's own form. Decorative only.
const LOGIN_WEEK = [ // per weekday: [top %, height %] of each lesson block
  [[6, 22], [44, 26]],
  [[18, 30], [64, 20]],
  [[4, 18], [34, 22], [70, 22]],
  [[26, 28]],
  [[10, 24], [52, 30]],
];
const LOGIN_TOASTS = [
  ['next', 'შემდეგი ლექცია', '14 წთ-ში · აუდ. 204'],
  ['grade', 'ახალი შეფასება', 'შუალედური · 27 / 30'],
  ['task', 'დავალება დაემატა', 'ვადა: პარასკევი, 23:59'],
];
const mountLogin = () => {
  const page = document.querySelector('login-component');
  if (root.classList.contains('sx-login') !== !!page) root.classList.toggle('sx-login', !!page);
  if (!page || page.querySelector(':scope > .sx-login-art')) return;
  const art = el('div', 'sx-login-art');
  art.setAttribute('aria-hidden', 'true');
  const brand = el('div', 'sx-la-brand', 'Alte');
  brand.append(el('span', 'sx-la-x', 'X'));
  const week = el('div', 'sx-la-week');
  ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ'].forEach((day, i) => {
    const col = el('div', 'sx-la-col');
    const track = el('div', 'sx-la-track');
    for (const [top, height] of LOGIN_WEEK[i]) {
      const b = el('i', 'sx-la-block');
      b.style.top = `${top}%`; b.style.height = `${height}%`;
      b.style.setProperty('--at', String(top / 100));
      track.append(b);
    }
    col.append(el('span', 'sx-la-day', day), track);
    week.append(col);
  });
  week.append(el('span', 'sx-la-now'));
  const stage = el('div', 'sx-la-stage');
  stage.append(week, ...LOGIN_TOASTS.map(([kind, title, sub], i) => {
    const t = el('div', 'sx-la-toast');
    t.dataset.kind = kind;
    t.style.setProperty('--n', String(i));
    const text = el('div', 'sx-la-toast-text');
    text.append(el('span', 'sx-la-toast-title', title), el('span', 'sx-la-toast-sub', sub));
    t.append(el('span', 'sx-la-toast-dot'), text);
    return t;
  }));
  const copy = el('div', 'sx-la-copy');
  copy.append(
    el('p', 'sx-la-title', 'სწავლა ისედაც მოსაწყენია. პორტალი მაინც იყოს სახალისო.'),
    el('p', 'sx-la-sub', 'ინფორმაცია ერთი შეხედვით, სწრაფი ნავიგაცია, თანამედროვე დიზაინი და სასარგებლო ფუნქციები.'),
  );
  art.append(brand, stage, copy);
  page.prepend(art);
};

// Welcome screen, once, right after signing in through the form in this tab (never on refresh).
// From the moment the login form is left, the page stays hidden (sx-await-welcome) so the
// dashboard never flashes before the welcome screen covers it.
const FRESH_KEY = 'sx-fresh-login';
const LAST_KEY = 'sx-last-student';
const offKey = (id) => `sx-welcome-off:${id}`;
const LOGIN_FORM = 'input[formcontrolname="password"], input[formcontrolname="username"]';
let freshLogin = false, awaitSince = 0;
const setAwait = (on) => { if (root.classList.contains('sx-await-welcome') !== on) root.classList.toggle('sx-await-welcome', on); };
const noteLoginPage = () => {
  freshLogin = true;
  awaitSince = Date.now();
  try { sessionStorage.setItem(FRESH_KEY, '1'); } catch { /* the in-memory flag covers the SPA login */ }
  const last = store.get(LAST_KEY);
  setAwait(!(last && store.get(offKey(last)) === '1'));
};
const takeFreshLogin = () => {
  let fresh = freshLogin;
  try { fresh = fresh || sessionStorage.getItem(FRESH_KEY) === '1'; sessionStorage.removeItem(FRESH_KEY); } catch { /* ignore */ }
  freshLogin = false;
  return fresh;
};

const showWelcome = (s) => {
  const w = el('div', 'sx-welcome');
  w.setAttribute('role', 'dialog');
  w.setAttribute('aria-modal', 'true');
  w.setAttribute('aria-labelledby', 'sx-w-title');
  const logo = el('div', 'sx-w-logo', 'Alte');
  logo.append(el('span', 'sx-w-x', 'X'));
  const title = el('h1', 'sx-w-title', 'კეთილი იყოს თქვენი მობრძანება AlteX პორტალზე');
  title.id = 'sx-w-title';
  const today = el('p', 'sx-w-today');
  const btn = el('button', 'sx-w-go', 'გაგრძელება →');
  btn.type = 'button';
  const off = el('label', 'sx-w-off');
  const box = el('input');
  box.type = 'checkbox';
  off.append(box, el('span', null, 'აღარ მაჩვენო'));
  const inner = el('div', 'sx-welcome-inner');
  inner.append(logo, title, el('p', 'sx-w-sub', 'Welcome to AlteX Portal'),
    el('p', 'sx-w-hello', s.firstName ? `გამარჯობა, ${s.firstName}` : 'გამარჯობა'), today, btn, off);
  w.append(inner);

  root.classList.add('sx-welcoming');
  root.append(w);
  requestAnimationFrame(() => w.classList.add('sx-in'));
  btn.focus({ preventScroll: true });
  load().then(() => { const line = todayLessonsLine(); if (line) { today.textContent = line; today.classList.add('sx-show'); } }).catch(() => {});

  let gone = false;
  btn.addEventListener('click', () => {
    if (gone) return;
    gone = true;
    if (box.checked) store.set(offKey(s.studentId), '1');
    setAwait(false);
    w.classList.add('sx-out');
    setTimeout(() => {
      w.remove();
      root.classList.remove('sx-welcoming');
      root.classList.add('sx-enter');
      setTimeout(() => root.classList.remove('sx-enter'), 1400);
    }, 320);
  });
};

const maybeWelcome = () => {
  if (document.querySelector(LOGIN_FORM)) { noteLoginPage(); return; }
  if (root.classList.contains('sx-welcoming')) return;
  if (!document.querySelector('user-menu-component')) {
    if (awaitSince && Date.now() - awaitSince > 6000) setAwait(false);
    return;
  }
  const s = takeFreshLogin() && session();
  if (!s || store.get(offKey(s.studentId)) === '1') { setAwait(false); return; }
  store.set(LAST_KEY, String(s.studentId));
  showWelcome(s);
};

// Remember the login and sign in again when the portal's 24-hour session ends. It is saved only after a
// login succeeds, and "გასვლა" (log out) forgets it.
// Android app: kept encrypted (Android Keystore) behind window.AltexApp, exposed to the portal origin only.
// Desktop extension: kept in the extension's local storage, which the portal's own scripts cannot read, but which is
// not encrypted on disk (it lives in the Chrome profile).
const LOGIN_STORE_KEY = 'sx-login';
const extStorage = () => { try { return globalThis.chrome?.storage?.local || null; } catch { return null; } };
const loginStore = () => {
  const app = window.AltexApp;
  if (app) {
    const send = (msg) => { try { app.postMessage(JSON.stringify(msg)); } catch { /* bridge gone */ } };
    return {
      where: 'ამ ტელეფონზე',
      get: (done) => {
        app.onmessage = (e) => {
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m && m.type === 'login') done(m.login);
        };
        send({ type: 'get' }); // the app answers only on the login page
      },
      save: (login) => send({ type: 'save', login }),
      forget: () => send({ type: 'forget' }),
    };
  }
  const local = extStorage();
  if (!local) return null;
  const quiet = (p) => { try { p?.catch?.(() => {}); } catch { /* extension reloaded */ } };
  return {
    where: 'ამ კომპიუტერზე',
    get: (done) => { try { local.get(LOGIN_STORE_KEY).then((r) => done(r && r[LOGIN_STORE_KEY]), () => done(null)); } catch { done(null); } },
    save: (login) => { try { quiet(local.set({ [LOGIN_STORE_KEY]: login })); } catch { /* extension reloaded */ } },
    forget: () => { try { quiet(local.remove(LOGIN_STORE_KEY)); } catch { /* extension reloaded */ } },
  };
};
let savedLogin, pendingLogin = null, autoLoginTried = false;
const forgetLogin = () => { savedLogin = null; pendingLogin = null; loginStore()?.forget(); };
const askSavedLogin = () => {
  const ls = loginStore();
  if (!ls || savedLogin !== undefined) return;
  savedLogin = null;
  ls.get((login) => { savedLogin = login && login.u && login.p ? { u: login.u, p: login.p } : null; schedule(); });
};
// Angular reads the input event; a plain .value change would be ignored.
const typeInto = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const waitFor = (test, ms) => new Promise((resolve) => {
  const until = Date.now() + ms;
  const tick = () => { const v = test(); if (v || Date.now() > until) resolve(v); else setTimeout(tick, 120); };
  tick();
});
const autoLogin = async (login) => {
  const form = document.querySelector('login-component .login-form');
  const user = form?.querySelector('input[formcontrolname="username"]');
  const submit = () => form.querySelector('.buttonWrapper button:not(:disabled)');
  if (!user) return;
  typeInto(user, login.u);
  (await waitFor(submit, 3000))?.click();
  const pass = await waitFor(() => form.isConnected && form.classList.contains('step-2') && form.querySelector('input[formcontrolname="password"]'), 8000);
  if (!pass) return;
  typeInto(pass, login.p);
  (await waitFor(submit, 3000))?.click();
};
const mountRemember = () => {
  const ls = loginStore();
  if (!ls) return;
  const page = document.querySelector('login-component');
  if (!page) {
    // Signed in: keep (or drop) what was typed, as the checkbox said.
    if (pendingLogin && session()) {
      if (pendingLogin.keep) ls.save({ u: pendingLogin.u, p: pendingLogin.p }); else forgetLogin();
      pendingLogin = null;
    }
    return;
  }
  const form = page.querySelector('.login-form');
  if (!form) return;
  askSavedLogin();
  if (!form.querySelector('.sx-remember')) {
    const label = el('label', 'sx-remember');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = true;
    label.append(box, el('span', null, `დამახსოვრება ${ls.where}`));
    form.querySelector('.buttonWrapper')?.before(label);
    const note = () => {
      const u = form.querySelector('input[formcontrolname="username"]')?.value || '';
      const p = form.querySelector('input[formcontrolname="password"]')?.value || '';
      if (u && p) pendingLogin = { u, p, keep: box.checked };
    };
    form.addEventListener('submit', note, true);
    form.addEventListener('click', (e) => { if (e.target.closest('.buttonWrapper button')) note(); }, true);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') note(); }, true);
  }
  if (savedLogin && !autoLoginTried) {
    autoLoginTried = true;
    autoLogin(savedLogin);
  }
};
