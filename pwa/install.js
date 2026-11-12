'use strict';
// Install experience: Chrome/Edge/Samsung (Android, desktop) fire beforeinstallprompt; iOS Safari never does,
// so iOS gets "Share → Add to Home Screen" steps. A dismissed banner is never shown again on this device.
const INSTALL_DISMISSED = 'altex-install-dismissed';
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA/.test(ua);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let deferredPrompt = null;
const $ = (id) => document.getElementById(id);

const installSteps = () => {
  if (isIOSSafari) return [
    ['Safari-ში დააჭირე ', 'გაზიარების', ' ღილაკს (კვადრატი ისრით) ქვემოთ ან ზემოთ.'],
    ['აირჩიე ', 'Add to Home Screen', ' / „მთავარ ეკრანზე დამატება“.'],
    ['დააჭირე ', 'Add', ' — AlteX გამოჩნდება მთავარ ეკრანზე.'],
  ];
  if (isIOS) return [
    ['iPhone-ზე და iPad-ზე დასაყენებლად გახსენი ეს გვერდი ', 'Safari', '-ში.'],
    ['შემდეგ დააჭირე ', 'გაზიარებას', ' → „Add to Home Screen“.'],
  ];
  return [
    ['გახსენი ბრაუზერის ', 'მენიუ', ' (⋮ ზედა კუთხეში).'],
    ['აირჩიე ', 'Install app', ' ან „Add to Home screen“ / „მთავარ ეკრანზე დამატება“.'],
    ['დაადასტურე — AlteX გაიხსნება ცალკე ფანჯარაში, როგორც აპი.'],
  ];
};

const openInstallSheet = () => {
  const steps = $('sheet-steps');
  steps.replaceChildren(...installSteps().map((parts) => {
    const li = el('li');
    parts.forEach((p, i) => li.append(i === 1 ? el('b', null, p) : document.createTextNode(p)));
    return li;
  }));
  const sheet = $('install-sheet');
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
};

const install = async () => {
  if (!deferredPrompt) { openInstallSheet(); return; }
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'dismissed') store.set(INSTALL_DISMISSED, String(Date.now()));
  refreshInstallUi();
};

const refreshInstallUi = () => {
  const installed = isStandalone();
  const dismissed = !!store.get(INSTALL_DISMISSED);
  // Only advertise where installing is actually possible right now.
  const canOffer = !installed && !dismissed && (deferredPrompt || isIOSSafari);
  $('install-banner').hidden = !canOffer;
  $('install-banner-sub').textContent = isIOSSafari ? 'Safari-ში: გაზიარება → Add to Home Screen.' : 'გახსენი ერთი შეხებით, ინტერნეტის გარეშეც.';
  $('install-manual').hidden = installed;
  $('install-state').textContent = installed
    ? 'AlteX უკვე დაყენებულია ამ მოწყობილობაზე.'
    : 'AlteX შეგიძლია დაიყენო მთავარ ეკრანზე, როგორც აპლიკაცია.';
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own banner instead of the browser's mini-infobar
  deferredPrompt = e;
  refreshInstallUi();
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; refreshInstallUi(); });

const initInstall = () => {
  $('install-go').addEventListener('click', install);
  $('install-manual').addEventListener('click', install);
  $('install-dismiss').addEventListener('click', () => { store.set(INSTALL_DISMISSED, String(Date.now())); refreshInstallUi(); });
  $('sheet-close').addEventListener('click', () => $('install-sheet').close());
  matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallUi);
  refreshInstallUi();
};
