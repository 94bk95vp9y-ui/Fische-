// Wiederverwendbare Oberflächen-Bausteine: Sheets, Aktionsmenüs, Toasts, Ziffernblock.
import { esc, parseMoney, fmtNum } from './util.js';
import { icon } from './icons.js';

const layer = () => document.getElementById('layer');
let openCount = 0;
let zTop = 100;

// Hintergrund festhalten, solange ein Fenster offen ist. position:fixed verhindert,
// dass iOS beim Antippen eines Textfelds die Seite darunter verschiebt.
let savedY = 0;
function lock() {
  if (openCount++ === 0) {
    savedY = window.scrollY;
    const b = document.body.style;
    b.position = 'fixed'; b.top = `-${savedY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
    document.documentElement.classList.add('locked');
  }
  // Ein noch sichtbarer Toast würde sonst Knöpfe des neuen Fensters verdecken
  const t = document.getElementById('toast');
  if (t) t.classList.remove('show');
}
function unlock() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    const b = document.body.style;
    b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
    document.documentElement.classList.remove('locked');
    window.scrollTo(0, savedY);
  }
}
export const isLocked = () => openCount > 0;

/**
 * Modales Blatt von unten (wie bei iOS).
 * opts: { title, left, right, rightPlain, onRight, onClose, content(html), foot(html), dirty(), cls }
 * onRight darf false zurückgeben, um offen zu bleiben.
 */
export function openSheet(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.style.zIndex = String(zTop += 2);
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || '')}">
      <header class="sheet-head">
        <span class="grabber" aria-hidden="true"></span>
        <button type="button" class="sheet-btn sheet-left">${esc(opts.left ?? 'Abbrechen')}</button>
        <h2 class="sheet-title">${esc(opts.title || '')}</h2>
        ${opts.right ? `<button type="button" class="sheet-btn sheet-right ${opts.rightPlain ? 'plain' : ''}">${esc(opts.right)}</button>` : '<span class="sheet-btn-spacer"></span>'}
      </header>
      <div class="sheet-body">${opts.content || ''}</div>
      ${opts.foot !== undefined ? `<div class="sheet-foot">${opts.foot}</div>` : ''}
    </section>`;
  layer().appendChild(wrap);
  lock();
  const sheet = wrap.querySelector('.sheet');
  const body = wrap.querySelector('.sheet-body');
  const rightBtn = wrap.querySelector('.sheet-right');
  let closed = false;

  const api = {
    el: sheet,
    body,
    foot: wrap.querySelector('.sheet-foot'),
    close(result) {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      unlock();
      setTimeout(() => wrap.remove(), 340);
      opts.onClose && opts.onClose(result);
    },
    setRight(label, enabled = true) {
      if (!rightBtn) return;
      if (label != null) rightBtn.textContent = label;
      rightBtn.disabled = !enabled;
    },
    setTitle(t) { wrap.querySelector('.sheet-title').textContent = t; },
    async tryClose() {
      if (opts.dirty && opts.dirty()) {
        const r = await actionSheet({ message: 'Deine Änderungen gehen verloren.', actions: [{ label: 'Änderungen verwerfen', value: 'discard', style: 'destructive' }], cancel: 'Weiter bearbeiten' });
        if (r !== 'discard') return false;
      }
      api.close();
      return true;
    },
  };

  wrap.querySelector('.sheet-left').addEventListener('click', () => {
    if (opts.onLeft) opts.onLeft(api); else api.tryClose();
  });
  if (rightBtn) {
    rightBtn.addEventListener('click', async () => {
      if (rightBtn.disabled) return;
      rightBtn.disabled = true;
      try {
        const r = await opts.onRight(api);
        if (r !== false) api.close('saved');
      } finally {
        if (!closed) rightBtn.disabled = false;
      }
    });
  }
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => api.tryClose());

  // Nach unten ziehen zum Schließen (am Kopfbereich)
  const head = wrap.querySelector('.sheet-head');
  let startY = null, dy = 0;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    startY = e.clientY; dy = 0;
    sheet.style.transition = 'none';
    head.setPointerCapture?.(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = async () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) await api.tryClose();
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);

  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

/**
 * iOS-artiges Aktionsmenü. actions: [{label, value, style:'destructive'|'default', icon}]
 * Ergebnis: value oder null (abgebrochen).
 */
export function actionSheet({ title = '', message = '', actions = [], cancel = 'Abbrechen' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'as-wrap';
    wrap.style.zIndex = String(zTop += 2);
    wrap.innerHTML = `
      <div class="sheet-backdrop"></div>
      <div class="as" role="dialog" aria-modal="true">
        <div class="as-group">
          ${title || message ? `<div class="as-head">${title ? `<strong>${esc(title)}</strong>` : ''}${message ? `<span>${esc(message)}</span>` : ''}</div>` : ''}
          ${actions.map((a, i) => `<button type="button" class="as-btn ${a.style || ''}" data-i="${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('')}
        </div>
        <button type="button" class="as-btn as-cancel" data-i="-1">${esc(cancel)}</button>
      </div>`;
    layer().appendChild(wrap);
    lock();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      wrap.classList.remove('open');
      unlock();
      setTimeout(() => wrap.remove(), 300);
      resolve(v);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) { const i = +b.dataset.i; finish(i >= 0 ? actions[i].value : null); return; }
      if (e.target.classList.contains('sheet-backdrop')) finish(null);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  });
}

export const confirmDanger = async (message, label, title = '') =>
  (await actionSheet({ title, message, actions: [{ label, value: true, style: 'destructive' }] })) === true;

// ---------- Toast ----------
let toastTimer = null;
export function toast(message, { action = null, duration = 4200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="toast-msg">${esc(message)}</span>${action ? `<button type="button" class="toast-act">${esc(action.label)}</button>` : ''}`;
  el.style.zIndex = String(zTop + 50);
  el.classList.toggle('has-action', !!action);
  if (action) {
    el.querySelector('.toast-act').onclick = () => { hide(); action.onClick(); };
  }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  const hide = () => el.classList.remove('show');
  toastTimer = setTimeout(hide, duration);
}

/** Toast mit Rückgängig-Button für eine commit()-Undo-Funktion */
export function undoToast(message, undo) {
  toast(message, { action: { label: 'Rückgängig', onClick: () => { undo(); toast('Rückgängig gemacht'); } }, duration: 5500 });
}

// ---------- Ziffernblock ----------
/** Formatiert den Eingabepuffer für die Anzeige: "1234,5" -> "1.234,5" */
export function formatBuffer(buf) {
  if (!buf) return '0';
  const [i, f] = buf.split(',');
  const intFmt = fmtNum(parseInt(i || '0', 10));
  return f !== undefined ? `${intFmt},${f}` : intFmt;
}

/**
 * Erstellt einen Ziffernblock. integer=true für Stückzahlen.
 * Rückgabe: { el, getCents(), getInt(), set(value) }
 */
export function createKeypad({ integer = false, initial = null, onChange = () => {}, maxInt = 6 } = {}) {
  let buf = '';
  let fresh = false; // vorbelegter Wert: erste Ziffer ersetzt ihn (wie beim Taschenrechner)
  const setFromValue = (v) => {
    if (v === null || v === undefined || v === '') { buf = ''; return; }
    if (integer) { buf = String(Math.max(0, Math.round(v))); if (buf === '0') buf = ''; return; }
    const a = Math.abs(Math.round(v));
    const euros = Math.floor(a / 100), cents = a % 100;
    buf = cents ? `${euros},${String(cents).padStart(2, '0')}` : String(euros);
    if (buf === '0') buf = '';
  };
  setFromValue(initial);
  fresh = buf !== '';

  const el = document.createElement('div');
  el.className = 'keypad';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', integer ? '' : ',', '0', 'del'];
  el.innerHTML = keys.map((k) => {
    if (k === '') return '<span class="key key-empty"></span>';
    if (k === 'del') return `<button type="button" class="key key-del" data-k="del" aria-label="Löschen">${icon('backspace')}</button>`;
    return `<button type="button" class="key" data-k="${k}">${k}</button>`;
  }).join('');

  const press = (k) => {
    if (fresh && k !== 'del') buf = '';
    fresh = false;
    if (k === 'del') buf = buf.slice(0, -1);
    else if (k === ',') { if (!buf.includes(',')) buf = (buf || '0') + ','; }
    else {
      const [i, f] = buf.split(',');
      if (f !== undefined) { if (f.length >= 2) return; buf += k; }
      else {
        if ((i || '').length >= maxInt) return;
        buf = buf === '0' ? k : buf + k;
      }
    }
    onChange(api);
  };

  // Gedrückt halten auf Löschen = alles leeren
  let holdTimer = null;
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-k="del"]');
    if (!b) return;
    holdTimer = setTimeout(() => { holdTimer = 'fired'; buf = ''; onChange(api); }, 550);
  });
  const clearHold = () => { if (holdTimer && holdTimer !== 'fired') clearTimeout(holdTimer); };
  el.addEventListener('pointerup', clearHold);
  el.addEventListener('pointercancel', clearHold);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    if (holdTimer === 'fired') { holdTimer = null; return; }
    holdTimer = null;
    press(b.dataset.k);
  });

  const api = {
    el,
    get buffer() { return buf; },
    getCents() { return buf ? parseMoney(buf.endsWith(',') ? buf.slice(0, -1) : buf) : null; },
    getInt() { return buf ? parseInt(buf, 10) : null; },
    set(v) { setFromValue(v); fresh = buf !== ''; onChange(api); },
    display() { return formatBuffer(buf); },
  };
  return api;
}

/**
 * Betrag oder Stückzahl über den eigenen Ziffernblock eingeben – ohne iOS-Tastatur.
 * opts: { title, label, initial, integer, unit, hint(value), quick:[{label,value}], allowEmpty, confirm, onSet(value) }
 */
export function openAmountPad(opts) {
  const integer = !!opts.integer;
  const unit = integer ? (opts.unit ?? 'Stück') : '€';
  const sheet = openSheet({
    title: opts.title || '',
    right: opts.confirm || 'Fertig',
    cls: 'sheet-keypad sheet-short',
    foot: '',
    content: `
      <div class="amount-display" data-display>
        ${opts.label ? `<span class="amount-label">${esc(opts.label)}</span>` : ''}
        <span class="amount-value"><span data-amt>0</span>${unit ? ' ' + esc(unit) : ''}</span>
        <span class="amount-hint" data-hint></span>
      </div>
      ${opts.quick && opts.quick.length ? `<div class="chips center" data-quick>${opts.quick.map((q, i) =>
        `<button type="button" class="chip" data-q="${i}">${esc(q.label)}</button>`).join('')}</div>` : ''}`,
    onRight: () => {
      const v = integer ? kp.getInt() : kp.getCents();
      if (v === null && !opts.allowEmpty) {
        const d = sheet.body.querySelector('[data-display]');
        d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
        return false;
      }
      opts.onSet(v);
      return true;
    },
  });
  const update = () => {
    sheet.body.querySelector('[data-amt]').textContent = kp.display();
    sheet.body.querySelector('[data-display]').classList.toggle('is-empty', !kp.buffer);
    const h = opts.hint ? opts.hint(integer ? kp.getInt() : kp.getCents()) : '';
    sheet.body.querySelector('[data-hint]').textContent = h || '';
  };
  const kp = createKeypad({ integer, initial: opts.initial ?? null, maxInt: integer ? 4 : 6, onChange: update });
  sheet.foot.appendChild(kp.el);
  sheet.body.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) kp.set(opts.quick[+q.dataset.q].value);
  });
  update();
  return sheet;
}

// ---------- Fotos ----------
/** Datei -> quadratisches JPEG als Data-URL (klein genug für die Speicherung auf dem Gerät) */
export async function fileToSquareJpeg(file, size = 480) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden')); });
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(w, h);
    const out = Math.min(size, s);
    const c = document.createElement('canvas');
    c.width = c.height = out;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, out, out);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const imgCache = new Map();
/** Data-URL -> kurze blob:-URL (schont das Neu-Zeichnen von Listen) */
export function imgSrc(dataUrl) {
  if (!dataUrl) return '';
  let u = imgCache.get(dataUrl);
  if (u) return u;
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    u = URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch { u = dataUrl; }
  if (imgCache.size > 300) imgCache.clear();
  imgCache.set(dataUrl, u);
  return u;
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => { resolve(input.files && input.files[0] ? input.files[0] : null); input.remove(); }, { once: true });
    input.click();
  });
}

// ---------- Zwischenablage & Teilen ----------
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* weiter mit Fallback */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export async function readClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return null;
  try { return await navigator.clipboard.readText(); } catch { return null; }
}

/**
 * Datei über das iOS-Teilen-Menü weitergeben (z. B. „In Dateien sichern“).
 * Fällt auf normalen Download zurück. Ergebnis: 'shared' | 'downloaded' | 'cancelled'
 */
export async function shareFile(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  // Manche Systeme lehnen z. B. application/json im Teilen-Menü ab – dann als Text versuchen
  for (const type of [mime, 'text/plain']) {
    let file = null;
    try { file = new File([content], filename, { type }); } catch { file = null; }
    if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) continue;
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      break; // anderer Fehler: auf Download ausweichen
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return 'downloaded';
}
