'use strict';
// Programme page: the portal builds its courses a quarter at a time (program-parts.js, page world). The button asks
// for the next quarter; <html data-sx-program-left> says how many courses are still to come.
const mountProgramMore = (view) => {
  const left = Number(root.dataset.sxProgramLeft) || 0;
  let more = view.querySelector(':scope > .sx-prog-more');
  if (!more) {
    if (!left) return;
    more = el('button', 'sx-prog-more');
    more.type = 'button';
    // The page world fills in the next quarter synchronously, so the count is current right after.
    more.addEventListener('click', () => { document.dispatchEvent(new CustomEvent('altex:program-more')); mountProgramMore(view); });
    view.append(more);
  }
  const text = `მეტის ჩვენება · Show more (${left})`;
  if (more.hidden !== !left) more.hidden = !left;
  if (more.textContent !== text) more.textContent = text;
};

// Back-to-top: shown once the student is a screen down the programme.
const syncProgramTop = () => {
  const top = document.querySelector('.sx-prog-top');
  if (top) top.toggleAttribute('data-shown', scrollY > innerHeight);
};
addEventListener('scroll', syncProgramTop, { passive: true });
// On <body>: a transformed ancestor (section entrance) would pin position:fixed to the page instead of the screen.
const mountProgramTop = (view) => {
  if (!view) return document.querySelector('.sx-prog-top')?.remove();
  if (document.querySelector('.sx-prog-top')) return;
  const top = el('button', 'sx-prog-top', '↑');
  top.type = 'button';
  top.setAttribute('aria-label', 'ზემოთ · Back to top');
  top.title = 'ზემოთ · Back to top';
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  document.body.append(top);
  syncProgramTop();
};

const enhanceProgram = () => {
  const view = document.querySelector('program-view');
  // Registration lists programme rows too; there every course must stay visible.
  if (view?.closest('registration-routes-component')) return mountProgramTop(null);
  mountProgramTop(view);
  if (!view) return;
  mountProgramMore(view);
  // Courses in and styled this frame: the section is ready, no need to wait out the spinner's quiet period.
  if (root.classList.contains('sx-routing') && view.getElementsByClassName('program-book-wrapper').length) routeDone();
};
