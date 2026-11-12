'use strict';
// Each course row gets a fold with its five latest assignments (read-only).
const TASKS_SHOWN = 5;
const taskItem = (t) => {
  const item = el('div', 'sx-tf-item');
  const meta = el('div', 'sx-tf-meta');
  if (t.posted) meta.append(el('span', 'sx-tf-date', `დაემატა ${dmy(t.posted)} · ${agoText(t.posted)}`));
  if (t.end) {
    const due = el('span', 'sx-tf-due', `ვადა ${dmy(t.end)} ${hm(t.end)}`);
    if (t.end.getTime() < Date.now()) due.classList.add('sx-past');
    meta.append(due);
  }
  const files = (t.files || []).length;
  if (files) meta.append(el('span', 'sx-tf-files', `${files} ფაილი`));
  item.append(el('div', 'sx-tf-name', t.name || 'დავალება'), meta);
  // The portal stores HTML: read it as text, never insert it as markup.
  const text = plainText(t.text);
  if (/^https?:\/\/\S+$/.test(text)) {
    const a = el('a', 'sx-tf-link', 'ბმულის გახსნა ↗');
    a.href = text; a.target = '_blank'; a.rel = 'noopener noreferrer';
    item.append(a);
  } else if (text) item.append(el('p', 'sx-tf-text', text));
  return item;
};

let taskBookMap = null;
const enhanceTasks = () => {
  const page = document.querySelector('tasks-mini-component');
  const s = page && session();
  if (!s) return;
  if (!taskBookMap) {
    taskBooks(s).then((list) => { taskBookMap = new Map(list.map((b) => [String(b.id), b])); schedule(); }).catch(() => {});
    return;
  }
  for (const row of page.querySelectorAll('mat-row')) {
    const id = row.querySelector('.mat-column-id')?.textContent.trim();
    const book = taskBookMap.get(id);
    let fold = row.querySelector(':scope > .sx-tf');
    if (fold && fold.dataset.id !== id) { fold.remove(); fold = null; }
    if (!book || fold) continue;
    fold = el('details', 'sx-tf');
    fold.dataset.id = id;
    const summary = el('summary', 'sx-tf-sum');
    const count = el('span', 'sx-tf-count', '…');
    summary.append(el('span', 'sx-tf-label', 'ბოლო დავალებები'), el('span', 'sx-tf-en', 'Latest assignments'), count, el('span', 'sx-chev'));
    const list = el('div', 'sx-tf-list');
    fold.append(summary, list);
    row.append(fold);
    courseTasks(s, book.listId).then((tasks) => {
      const shown = tasks.slice(0, TASKS_SHOWN);
      count.textContent = String(shown.length);
      fold.classList.toggle('sx-tf-none', !shown.length);
      list.replaceChildren(...(shown.length ? shown.map(taskItem) : [el('p', 'sx-tf-empty', 'ამ საგანში დავალება ჯერ არ დადებულა · No assignments posted yet')]));
    }).catch(() => {
      count.textContent = '!';
      list.replaceChildren(el('p', 'sx-tf-empty', 'დავალებები ვერ ჩაიტვირთა · Could not load assignments'));
    });
  }
};
