'use strict';
// Student card: "label: value" lines become tiles; GPA and personal number stay masked until the eye is pressed.
const REG_FACTS = [[/^სემესტრი/, 'semester'], [/^GPA/, 'gpa'], [/^არჩეული კრედიტ/, 'credits']];
const REG_SECRET = [/^GPA/, /^პ\/ნ/];
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sx-eye-open" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle class="sx-eye-open" cx="12" cy="12" r="3"/><path class="sx-eye-shut" d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const revealed = new Set();

const buildTile = (li) => {
  const tile = el('div', 'sx-tile');
  tile.append(el('span', 'sx-k'), el('span', 'sx-v'));
  const eye = el('button', 'sx-eye');
  eye.type = 'button';
  eye.innerHTML = EYE;
  eye.addEventListener('click', () => {
    const k = li.dataset.sxK;
    if (revealed.has(k)) revealed.delete(k); else revealed.add(k);
    enhanceRegistration();
  });
  tile.append(eye);
  li.append(tile);
  return tile;
};

const enhanceRegistrationTiles = (page) => {
  for (const li of page.querySelectorAll('.student-info-card mat-list-item')) {
    const src = [...li.childNodes].filter((n) => !(n.classList && n.classList.contains('sx-tile'))).map((n) => n.textContent).join('');
    const text = src.replace(/\s+/g, ' ').trim();
    const i = text.indexOf(':');
    if (i <= 0) continue;
    const k = text.slice(0, i).trim(), v = text.slice(i + 1).trim() || '—';
    const secret = v !== '—' && REG_SECRET.some((re) => re.test(k));
    const shown = secret && !revealed.has(k) ? '*'.repeat(Math.min(v.length, 12)) : v;
    const fact = (REG_FACTS.find(([re]) => re.test(k)) || [])[1] || '';
    if (li.dataset.sxK !== k) li.dataset.sxK = k;
    if ((li.dataset.sxFact || '') !== fact) { if (fact) li.dataset.sxFact = fact; else delete li.dataset.sxFact; }
    li.classList.toggle('sx-secret', secret);
    const tile = li.querySelector(':scope > .sx-tile') || buildTile(li);
    const [kEl, vEl, eye] = tile.children;
    if (kEl.textContent !== k) kEl.textContent = k;
    if (vEl.textContent !== shown) vEl.textContent = shown;
    const open = String(revealed.has(k));
    if (eye.getAttribute('aria-pressed') !== open) {
      eye.setAttribute('aria-pressed', open);
      eye.setAttribute('aria-label', revealed.has(k) ? 'დამალვა · Hide' : 'ჩვენება · Show');
    }
  }
};

// The registration-group picker becomes a plain season chip ("2026/2027 საშემოდგომო").
const enhanceRegistrationSeason = (page) => {
  const head = page.querySelector(':scope > .width > div:first-child');
  const value = head?.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-value')?.textContent.replace(/^\s*\d+\)\s*/, '').replace(/\s+/g, ' ').trim();
  if (!head || !value) return;
  head.classList.add('sx-reg-head');
  let chip = head.querySelector(':scope > .sx-reg-season');
  if (!chip) { chip = el('div', 'sx-reg-season'); head.append(chip); }
  if (chip.textContent !== value) chip.textContent = value;
};

const enhanceRegistration = () => {
  const page = document.querySelector('registration-routes-component');
  if (!page) return;
  enhanceRegistrationSeason(page);
  enhanceRegistrationTiles(page);
  for (const row of page.querySelectorAll('.program-book-wrapper')) {
    const icons = [...row.querySelectorAll('.program-panel mat-icon')].map((x) => x.textContent.trim());
    const st = icons.includes('thumb_up') ? 'chosen' : icons.includes('done') ? 'done' : '';
    if (row.dataset.sxSt !== st) row.dataset.sxSt = st;
  }
};
