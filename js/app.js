'use strict';
// Android app only (window.AltexApp): the portal builds some files in the page as blob: links, which a
// WebView cannot download. Each blob is kept as it is created; when its link is clicked or opened, the
// file goes to the app (MainActivity → Downloads.java), which saves it to Downloads and opens it.
// In the desktop extension this runs in the isolated world and never sees the portal's blobs.
const pageBlobs = new Map();
const BLOB_TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/zip': 'zip' };
{
  const create = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = create.call(URL, obj);
    if (obj instanceof Blob) {
      pageBlobs.set(url, obj);
      if (pageBlobs.size > 20) pageBlobs.delete(pageBlobs.keys().next().value);
    }
    return url;
  };
}
const sendBlob = (url, name) => {
  const app = window.AltexApp, blob = pageBlobs.get(url);
  if (!app || !blob) return false;
  const reader = new FileReader();
  reader.onload = () => app.postMessage(JSON.stringify({
    type: 'file', mime: blob.type,
    name: name || `AlteX-${isoDate(new Date())}.${BLOB_TYPES[blob.type] || 'bin'}`,
    data: String(reader.result).split(',')[1] || '',
  }));
  reader.readAsDataURL(blob);
  return true;
};
const blobHref = (a) => (a && typeof a.href === 'string' && a.href.startsWith('blob:') ? a.href : '');
{
  // Covers a.click() on links that were never added to the page, real taps, and window.open(blob).
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (blobHref(this) && sendBlob(this.href, this.download)) return undefined;
    return click.call(this);
  };
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (blobHref(a) && sendBlob(a.href, a.download)) e.preventDefault();
  }, true);
  const open = window.open;
  window.open = function (url, ...rest) {
    if (typeof url === 'string' && url.startsWith('blob:') && sendBlob(url)) return null;
    return open.call(window, url, ...rest);
  };
}
