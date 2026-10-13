/* Local PDF library: PDF bytes never enter synced records or JSON backups. */
(function () {
  'use strict';
  const DB_NAME = 'reading-garden-local-pdfs-v1';
  const STORE = 'pdfs';
  const PREF = 'reading-garden-auto-pdf-v1';
  const MAX_BYTES = 50 * 1024 * 1024;
  let opening, seen = new Set(), namespace = null, busy = new Set();
  const $ = s => document.querySelector(s);
  const ns = () => typeof storageNamespace === 'string' ? storageNamespace : '';
  const records = () => typeof papers === 'undefined' ? [] : papers.filter(p => p && p.kind !== 'book');
  const key = (space, id) => JSON.stringify([space, id]);
  const settingKey = () => ns() + ':' + PREF;
  const enabled = () => localStorage.getItem(settingKey()) !== 'off';
  const inform = msg => { if (typeof toast === 'function') toast(msg); };
  function database() {
    if (!('indexedDB' in window)) return Promise.reject(Error('IndexedDB unavailable'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function read(space, id) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key(space, id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function store(space, id, file, name) {
    if (!file || file.size > MAX_BYTES || file.size < 5) throw Error('PDF must be smaller than 50 MB');
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...header) !== '%PDF-') throw Error('This file is not a valid PDF');
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob: file, name: name || 'paper.pdf', saved: Date.now() }, key(space, id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function paperDoi(p) {
    const raw = String(p.doi || p.link || '');
    const match = raw.match(/(?:doi\.org\/|^)(10\.\d{4,9}\/[^\s?#]+)/i);
    return match ? match[1].replace(/[.,;]+$/, '') : '';
  }
  async function candidates(p) {
    const doi = paperDoi(p);
    if (!doi) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.openalex.org/works/https://doi.org/' + encodeURIComponent(doi), { signal: controller.signal });
      if (!response.ok) return [];
      const data = await response.json();
      const locations = [data.best_oa_location, data.primary_location, ...(data.locations || [])].filter(Boolean);
      return [...new Set(locations.filter(x => x.is_oa !== false).map(x => x.pdf_url).filter(u => /^https:\/\//i.test(u || '')))];
    } catch { return []; }
    finally { clearTimeout(timer); }
  }
  async function autoFetch(p, space) {
    const id = p.id, job = key(space, id);
    if (busy.has(job) || !enabled()) return;
    busy.add(job);
    try {
      if (await read(space, id)) return;
      for (const url of await candidates(p)) {
        if (space !== ns() || !records().some(x => x.id === id)) return;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_BYTES) continue;
          const blob = await response.blob();
          if (space !== ns() || !records().some(x => x.id === id)) return;
          await store(space, id, blob, (p.title || 'paper').replace(/[^a-z0-9 _-]/gi, '').slice(0, 80) + '.pdf');
          inform('PDF saved locally for ' + p.title);
          refresh();
          return;
        } catch { /* Publisher CORS restrictions are common; manual upload remains available. */ }
      }
    } catch (error) { console.warn('Local PDF storage unavailable:', error); }
    finally { busy.delete(job); refresh(); }
  }
  async function view(id) {
    const space = ns();
    try {
      const item = await read(space, id);
      if (!item || ns() !== space) return inform('PDF missing on this device. Use Add PDF.');
      const objectUrl = URL.createObjectURL(item.blob);
      const tab = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!tab) {
        const link = document.createElement('a');
        link.href = objectUrl; link.download = item.name; link.click();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch { inform('Could not open the local PDF.'); }
  }
  function upload(id) {
    const space = ns();
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = '.pdf,application/pdf';
    picker.onchange = async () => {
      const file = picker.files && picker.files[0];
      if (!file) return;
      if (space !== ns() || !records().some(p => p.id === id)) return;
      try { await store(space, id, file, file.name); inform('PDF added to this browser.'); refresh(); }
      catch (error) { inform(error.message || 'Could not save PDF.'); }
    };
    picker.click();
  }
  async function paint(root, id) {
    const space = ns();
    const old = root.querySelector('[data-local-pdf]');
    if (old) old.remove();
    const wrap = document.createElement('span');
    wrap.dataset.localPdf = id;
    wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px';
    const existing = await read(space, id).catch(() => null);
    if (!root.isConnected || space !== ns()) return;
    const primary = document.createElement('button');
    primary.type = 'button'; primary.className = 'secondary';
    primary.textContent = existing ? 'View PDF' : (busy.has(key(space, id)) ? 'Finding PDF…' : 'Add PDF');
    primary.disabled = !existing && busy.has(key(space, id));
    primary.style.cssText = 'padding:4px 8px;font-size:11px';
    primary.onclick = event => { event.stopPropagation(); existing ? view(id) : upload(id); };
    wrap.append(primary);
    if (existing) {
      const replace = document.createElement('button');
      replace.type = 'button'; replace.className = 'secondary'; replace.textContent = 'Replace PDF';
      replace.style.cssText = 'padding:4px 8px;font-size:11px';
      replace.onclick = event => { event.stopPropagation(); upload(id); };
      wrap.append(replace);
    }
    root.append(wrap);
  }
  function refresh() {
    for (const card of document.querySelectorAll('#cards .card[data-id]')) {
      const id = card.dataset.id;
      if (!records().some(p => p.id === id)) continue;
      const area = card.querySelector('.cardbottom');
      if (area) paint(area, id);
    }
    const editorArea = $('#localPdfEditor');
    if (editorArea) {
      const id = typeof editing !== 'undefined' ? editing : null;
      editorArea.hidden = !id || !records().some(p => p.id === id);
      if (!editorArea.hidden) paint(editorArea, id);
    }
  }
  function checkNew() {
    const space = ns();
    if (namespace !== space) {
      namespace = space;
      seen = new Set(records().map(p => p.id));
      refresh();
      return;
    }
    const current = records();
    const newOnes = current.filter(p => !seen.has(p.id));
    seen = new Set(current.map(p => p.id));
    for (const p of newOnes) if (enabled()) autoFetch(p, space);
    refresh();
  }
  function setup() {
    const editor = $('#paperForm');
    const anchor = $('#cards');
    if (!editor || !anchor) return;
    const settings = document.createElement('label');
    settings.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:9px;font-size:12px;margin:12px 0';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.checked = enabled();
    toggle.onchange = () => {
      localStorage.setItem(settingKey(), toggle.checked ? 'on' : 'off');
      inform(toggle.checked ? 'Auto-download enabled for newly added papers.' : 'Auto-download disabled.');
    };
    settings.append(toggle, document.createTextNode('Auto-download open-access PDF when adding a paper (this browser only)'));
    const hint = document.createElement('p');
    hint.className = 'small';
    hint.textContent = 'PDF files stay in this browser. They are not included in cloud sync or JSON backups. If automatic download is blocked, use Add PDF.';
    const block = document.createElement('div');
    block.id = 'localPdfEditor'; block.style.marginTop = '12px';
    editor.insertBefore(settings, editor.lastElementChild);
    editor.insertBefore(hint, editor.lastElementChild);
    editor.insertBefore(block, editor.lastElementChild);
    // Also expose the setting in All Papers, without requiring the editor.
    const toolbar = $('#search')?.parentElement;
    if (toolbar) {
      const label = settings.cloneNode(true);
      const input = label.querySelector('input');
      input.checked = enabled();
      input.onchange = () => {
        localStorage.setItem(settingKey(), input.checked ? 'on' : 'off');
        toggle.checked = input.checked;
      };
      toolbar.append(label);
    }
    namespace = ns();
    seen = new Set(records().map(p => p.id));
    document.addEventListener('reading-garden:changed', checkNew);
    new MutationObserver(() => {
      // No DOM mutation loop: only add controls where they are absent.
      for (const card of document.querySelectorAll('#cards .card[data-id]')) {
        const area = card.querySelector('.cardbottom');
        if (area && !area.querySelector('[data-local-pdf]')) paint(area, card.dataset.id);
      }
    }).observe(anchor, { childList: true, subtree: false });
    $('#editor')?.addEventListener('click', () => setTimeout(refresh, 0));
    anchor.addEventListener('click', () => setTimeout(refresh, 0));
    refresh();
    setInterval(() => { if (namespace !== ns()) checkNew(); }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
  window.ReadingGardenLocalPDF = { read, store, paperDoi };
})();
