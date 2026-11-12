'use strict';
// One summary card from the site's schedule rows (first = year total, the rest = instalments).
const money = (n) => `${Math.round(n * 100) / 100} ₾`;
const num = (t) => { const n = parseFloat(String(t || '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isNaN(n) ? null : n; };

// Desktop: [name+date, 3 labels] / [blank, 3 values]. Phones: [name+date] / [3 labels] / [3 values].
const FIN_LABEL = /^(გადასახდელი|გადახდილი|დარჩენილი)$/;
const readFinanceRow = (menu) => {
  const rows = [...menu.querySelectorAll(':scope > .wrapper-row')];
  if (rows.length < 2) return null;
  if (menu.dataset.sxRows !== String(rows.length)) menu.dataset.sxRows = String(rows.length);
  const cells = [...rows[rows.length - 1].querySelectorAll(':scope > div')].slice(-3);
  const texts = rows.slice(0, -1).flatMap((r) => [...r.querySelectorAll('span')]).map((x) => x.textContent.trim()).filter((t) => t && !FIN_LABEL.test(t));
  const dateText = texts.find((t) => /\d{2}\.\d{2}\.\d{4}/.test(t)) || '';
  const first = [texts.find((t) => t !== dateText) || '', dateText];
  const due = num(cells[0]?.textContent), paid = num(cells[1]?.textContent) || 0;
  const left = due == null ? null : Math.max(0, due - paid);
  [due, paid, left].forEach((v, i) => {
    const cell = cells[i];
    if (!cell) return;
    const show = v == null ? '—' : money(v);
    if (cell.dataset.sxV !== show) cell.dataset.sxV = show;
    cell.classList.toggle('sx-fin-due', i === 2 && v > 0);
  });
  const [d, m, y] = (/\d{2}\.\d{2}\.\d{4}/.exec(first[1] || '') || [''])[0].split('.').map(Number);
  return { name: first[0], dateText: first[1] || '', date: y ? new Date(y, m - 1, d) : null, due, paid, left };
};

const finFact = (cap, val, sub, cls) => {
  const f = el('div', 'sx-fin-fact' + (cls ? ' ' + cls : ''));
  f.append(el('span', 'sx-fin-cap', cap), el('span', 'sx-fin-val', val));
  if (sub) f.append(el('span', 'sx-fin-sub', sub));
  return f;
};

const enhanceFinances = () => {
  const page = document.querySelector('.page-finances');
  if (!page) return;
  const rows = [...page.querySelectorAll('mat-expansion-panel-header .wrapper-menu')].map(readFinanceRow).filter(Boolean);
  const total = rows.find((r) => !r.date);
  let card = page.querySelector(':scope > .sx-fin');
  if (!total || total.due == null) { card?.remove(); return; }
  const next = rows.filter((r) => r.date && r.left > 0).sort((x, y) => x.date - y.date)[0];
  const balance = [...page.querySelectorAll('.balance-wrapper .info-wrapper > div')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const days = next ? daysUntil(next.date) : null;
  const key = JSON.stringify([total, next && [next.dateText, next.left], balance, days]);
  if (card && card.dataset.key === key) return;
  if (!card) { card = el('div', 'sx-fin'); page.querySelector('mat-tab-group')?.before(card); }
  card.dataset.key = key;
  const pct = total.due > 0 ? Math.max(0, Math.min(100, (total.paid / total.due) * 100)) : 0;

  const head = el('div', 'sx-fin-head');
  const big = el('div', 'sx-fin-paid');
  big.append(el('span', 'sx-fin-num', String(total.paid)), el('span', 'sx-fin-of', ` / ${money(total.due)}`));
  const paidBox = el('div', 'sx-fin-paidbox');
  paidBox.append(el('span', 'sx-fin-cap', 'გადახდილია · Paid'), big);
  head.append(paidBox);
  if (next) {
    const cd = el('div', 'sx-fin-count' + (days < 0 ? ' sx-late' : ''));
    const n = el('div', 'sx-fin-count-n');
    n.append(el('span', 'sx-fin-count-num', String(Math.abs(days))), el('span', 'sx-fin-count-unit', 'დღე'));
    cd.append(
      el('span', 'sx-fin-cap', days < 0 ? 'გადახდის ვადა გასულია · Overdue' : 'გადახდამდე დარჩა · Until next payment'),
      n,
      el('span', 'sx-fin-sub', `${next.dateText} · ${money(next.left)}`),
    );
    head.append(cd);
  }
  const bar = el('div', 'sx-fin-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(total.due)); bar.setAttribute('aria-valuenow', String(total.paid));
  const fill = el('i'); fill.style.width = `${pct}%`; bar.append(fill);
  const facts = el('div', 'sx-fin-facts');
  facts.append(
    finFact('დარჩენილია · Remaining', money(total.left), `${Math.round(pct)}% გადახდილია`),
    next
      ? finFact('შემდეგი გადახდა · Next payment', next.dateText, `${money(next.left)} · ${days < 0 ? `ვადა გავიდა ${-days} დღის წინ` : days === 0 ? 'დღეს' : `${days} დღეში`}`, days < 0 ? 'sx-late' : '')
      : finFact('შემდეგი გადახდა · Next payment', 'არ არის', 'ყველაფერი გადახდილია'),
  );
  for (const b of balance) { const [cap, val] = b.split(/:\s*/); facts.append(finFact(cap, val || '')); }
  card.replaceChildren(head, bar, facts);
};
