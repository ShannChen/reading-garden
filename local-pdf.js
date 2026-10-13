/* PDFs stay in this browser's IndexedDB, outside cloud sync and JSON backups. */
(function () {
  'use strict';
  const DB = 'reading-garden-local-pdfs-v1', STORE = 'pdfs', MAX_BYTES = 50 * 1024 * 1024;
  let opening = null, generation = 0;
  const space = () => typeof storageNamespace === 'string' ? storageNamespace : '';
  const key = (owner, id) => JSON.stringify([owner, id]);
  const papersList = () => typeof papers === 'undefined' ? [] : papers;
  const notify = message => { if (typeof toast === 'function') toast(message); };
  function database() {
    if (!window.indexedDB) return Promise.reject(Error('Local PDF storage is unavailable.'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function read(owner, id) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key(owner, id));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  async function store(owner, id, file, name) {
    if (!file || file.size < 5 || file.size > MAX_BYTES) throw Error('Choose a PDF under 50 MB.');
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...header) !== '%PDF-') throw Error('The selected file is not a PDF.');
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob: file, name: name || 'paper.pdf', saved: Date.now() }, key(owner, id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function deletePdf(id) {
    const owner = space();
    if (!window.confirm('Delete this PDF from this browser? The paper and its notes will stay.')) return;
    try {
      const db = await database();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key(owner, id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      if (owner === space()) {
        notify('PDF deleted. Paper and notes kept.');
        refresh();
      }
    } catch { notify('Could not delete the PDF.'); }
  }
  function upload(id) {
    const owner = space();
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.pdf,application/pdf';
    picker.onchange = async () => {
      const file = picker.files && picker.files[0];
      if (!file || owner !== space() || !papersList().some(p => p.id === id && p.kind !== 'book')) return;
      try {
        await store(owner, id, file, file.name);
        notify('PDF saved in this browser.');
        refresh();
      } catch (error) { notify(error.message || 'Could not save PDF.'); }
    };
    picker.click();
  }
  async function view(id) {
    const owner = space();
    // Open the tab from the user's click so popup blockers do not prevent viewing.
    const tab = window.open('', '_blank');
    try {
      const saved = await read(owner, id);
      if (!saved || owner !== space()) {
        if (tab) tab.close();
        notify('PDF is missing in this browser. Use Add PDF.');
        return;
      }
      const url = URL.createObjectURL(saved.blob);
      if (tab) {
        tab.location.href = url;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = saved.name;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      if (tab) tab.close();
      notify('Could not open the local PDF.');
    }
  }
  async function paint(card, owner, token) {
    const id = card.dataset.id;
    if (!id || card.querySelector('[data-local-pdf]')) return;
    const paper = papersList().find(p => p.id === id && p.kind !== 'book');
    if (!paper) return;
    const controls = document.createElement('span');
    controls.dataset.localPdf = id;
    controls.style.cssText = 'position:absolute;right:18px;bottom:14px;display:flex;align-items:center;gap:8px;z-index:1';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = 'Add PDF';
    button.style.cssText = 'padding:5px 10px;font-size:12px';
    button.onclick = event => {
      event.stopPropagation();
      if (button.dataset.hasPdf === 'yes') view(id);
      else upload(id);
    };
    controls.append(button);
    card.style.position = 'relative';
    card.style.paddingBottom = '61px';
    card.append(controls);
    try {
      const saved = await read(owner, id);
      if (!controls.isConnected || owner !== space() || token !== generation) return;
      button.dataset.hasPdf = saved ? 'yes' : 'no';
      button.textContent = saved ? 'View PDF' : 'Add PDF';
      if (saved) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        remove.textContent = 'Delete PDF';
        remove.setAttribute('aria-label', 'Delete PDF for ' + paper.title);
        remove.style.cssText = 'padding:5px 10px;font-size:12px;color:#9b4c40';
        remove.onclick = event => { event.stopPropagation(); deletePdf(id); };
        controls.prepend(remove);
      }
    } catch { /* Manual upload still reports storage errors when clicked. */ }
  }
  function refresh() {
    const owner = space(), token = ++generation;
    for (const card of document.querySelectorAll('#cards .card[data-id]')) {
      const button = card.querySelector('[data-local-pdf]');
      if (button) {
        button.remove();
      }
      paint(card, owner, token);
    }
  }
  function setup() {
    const cards = document.querySelector('#cards');
    if (!cards) return;
    new MutationObserver(() => {
      for (const card of cards.querySelectorAll('.card[data-id]')) {
        if (!card.querySelector('[data-local-pdf]')) paint(card, space(), generation);
      }
    }).observe(cards, { childList: true });
    document.addEventListener('reading-garden:changed', refresh);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
  window.ReadingGardenLocalPDF = { read, store };
})();
