// HTML-Bausteine, die in mehreren Ansichten vorkommen.
import { esc, money, moneyAxis, relDay, monthLabel, fmtDate } from './util.js';
import { icon, CAT_GLYPH } from './icons.js';
import { CHANNELS, entryTitle, PRODUCT_CATS } from './model.js';
import { imgSrc } from './ui.js';
import { store, getEvent } from './store.js';

export function thumb(p, cls = '') {
  if (p && p.image) {
    return `<span class="thumb ${cls}"><img src="${esc(imgSrc(p.image))}" alt="" loading="lazy" decoding="async"></span>`;
  }
  const cat = (p && p.category) || 'sonstiges';
  return `<span class="thumb glyph cat-${esc(cat)} ${cls}">${icon(CAT_GLYPH[cat] || 'box')}</span>`;
}

const TYPE_ICON = { sale: 'arrowDown', expense: 'arrowUp', withdrawal: 'person', deposit: 'plusCircle', adjust: 'scale' };

export function amountHtml(e) {
  if (e.status === 'open') return `<span class="ramt muted">${money(e.amount)}</span>`;
  switch (e.type) {
    case 'sale': return `<span class="ramt pos">${money(e.amount, { sign: true })}</span>`;
    case 'expense': return `<span class="ramt neg">${money(-e.amount)}</span>`;
    case 'withdrawal': return `<span class="ramt">${money(-e.amount)}</span>`;
    case 'deposit': return `<span class="ramt">${money(e.amount, { sign: true })}</span>`;
    case 'adjust': return `<span class="ramt">${money(e.amount, { sign: true })}</span>`;
  }
  return '';
}

export function entrySub(e, { showDate = true } = {}) {
  const parts = [];
  if (showDate) parts.push(relDay(e.date));
  if (e.type === 'sale') {
    if (e.eventId) { const ev = getEvent(e.eventId); parts.push(ev ? ev.name : CHANNELS.messe.short); }
    else parts.push((CHANNELS[e.channel] || CHANNELS.other).short);
    if (e.items && e.items.length && e.note) parts.push(e.note);
  } else if (e.type === 'expense' && e.eventId) {
    if (e.note) parts.push(e.note);
    const ev = getEvent(e.eventId); if (ev) parts.push(ev.name);
  } else if (e.note) parts.push(e.note);
  return parts.map(esc).join(' · ');
}

export function entryRow(e, opts = {}) {
  const t = e.type === 'sale' && e.items && e.items.length ? 'basket' : TYPE_ICON[e.type];
  return `<button type="button" class="row entry" data-entry="${esc(e.id)}">
    <span class="ricon t-${e.type}${e.status === 'open' ? ' t-open' : ''}">${icon(e.status === 'open' ? 'clock' : t)}</span>
    <span class="rmain">
      <span class="rtitle">${esc(entryTitle(e, store.state.events))}${e.status === 'open' ? ' <em class="pill">offen</em>' : ''}</span>
      <span class="rsub">${entrySub(e, opts)}</span>
    </span>
    ${opts.hideAmount ? '' : amountHtml(e)}
  </button>`;
}

export function seg(name, options, current, cls = '') {
  return `<div class="seg ${cls}" role="tablist" data-seg="${esc(name)}">${options.map((o) =>
    `<button type="button" role="tab" aria-selected="${o.value === current}" class="${o.value === current ? 'on' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;
}

export function chips(name, options, current, cls = '') {
  return `<div class="chips ${cls}" data-chips="${esc(name)}">${options.map((o) =>
    `<button type="button" class="chip ${o.value === current ? 'on' : ''}" aria-pressed="${o.value === current}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;
}

/** Segment-/Chip-Auswahl in einem Container live umschalten */
export function bindChoice(root, selector, onPick) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest(`${selector} [data-value]`);
    if (!b) return;
    const group = b.parentElement;
    group.querySelectorAll('[data-value]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      if (x.hasAttribute('aria-selected')) x.setAttribute('aria-selected', String(on));
      if (x.hasAttribute('aria-pressed')) x.setAttribute('aria-pressed', String(on));
    });
    onPick(b.dataset.value, group.dataset.seg || group.dataset.chips, b);
  });
}

/** Abschnitt mit kleiner Überschrift – immer gleicher Abstand zwischen Überschrift und Inhalt */
export function sec(label, inner, attrs = '') {
  return `<div class="sec" ${attrs}>${label ? `<div class="sec-label">${label}</div>` : ''}${inner}</div>`;
}

/** Antippbare Zeile für Beträge/Mengen (öffnet den Ziffernblock statt der iOS-Tastatur) */
export function amountRow(key, label, value, { integer = false, placeholder = 'antippen', ic = '', unit = 'Stück' } = {}) {
  return `<button type="button" class="field row-field amt-row" data-amt="${esc(key)}">
    <span class="field-label">${ic ? icon(ic) : ''}${esc(label)}</span>
    <span class="amt-val ${value == null ? 'empty' : ''}">${esc(amountText(value, { integer, placeholder, unit }))}</span>
  </button>`;
}
export function amountText(value, { integer = false, placeholder = 'antippen', unit = 'Stück' } = {}) {
  if (value == null) return placeholder;
  return integer ? `${value} ${unit}`.trim() : money(value);
}
export function setAmountRow(root, key, value, opts = {}) {
  const el = root.querySelector(`[data-amt="${CSS.escape(key)}"] .amt-val`);
  if (!el) return;
  el.textContent = amountText(value, opts);
  el.classList.toggle('empty', value == null);
}

export function empty(title, text, actionsHtml = '', ic = 'fish') {
  return `<div class="empty"><span class="empty-art">${icon(ic)}</span><strong>${esc(title)}</strong><p>${esc(text)}</p>${actionsHtml}</div>`;
}

/** Betrag mit kleiner gesetzten Cent: "701" + ",14 €" */
export function moneyParts(cents) {
  const s = money(cents);
  const i = s.lastIndexOf(',');
  if (i < 0) return esc(s);
  return `<span class="m-int">${esc(s.slice(0, i))}</span><span class="m-frac">${esc(s.slice(i))}</span>`;
}

export function productPriceLine(p) {
  const t = (p.tiers || []).slice().sort((a, b) => a.min - b.min);
  let s = money(p.price);
  if (t.length) s += ` <span class="muted">· ab ${t[0].min}: ${money(t[0].price)}</span>`;
  return s;
}

export const catLabel = (k) => (PRODUCT_CATS[k] || PRODUCT_CATS.sonstiges).label;

// ---------- Monatsdiagramm ----------
function niceMax(v) {
  if (v <= 0) return 10000; // 100 €
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

/**
 * Säulendiagramm Umsatz vs. Ausgaben je Monat.
 * data: [{key, revenue, expenses}], selected: key
 */
export function monthChart(data, selected, { mini = false } = {}) {
  const max = niceMax(Math.max(0, ...data.map((d) => Math.max(d.revenue, d.expenses))));
  const h = (v) => (v <= 0 ? 0 : Math.max(1.5, (v / max) * 100));
  const sel = data.find((d) => d.key === selected) || data[data.length - 1];
  const label = (d) => `${monthLabel(d.key)}: Umsatz ${money(d.revenue)}, Ausgaben ${money(d.expenses)}`;
  return `<div class="chart ${data.length > 8 ? 'many' : ''}" data-chart>
    <div class="chart-readout" data-readout aria-live="polite">${readout(sel)}</div>
    <div class="chart-plot">
      <div class="chart-grid" aria-hidden="true">
        <span style="bottom:100%"><em>${moneyAxis(max)}</em></span>
        <span style="bottom:50%"><em>${moneyAxis(max / 2)}</em></span>
        <span style="bottom:0"><em>0 €</em></span>
      </div>
      <div class="chart-cols">
        ${data.map((d) => `<button type="button" class="ccol ${d.key === sel.key ? 'sel' : ''}" data-month="${d.key}"
            data-rev="${d.revenue}" data-exp="${d.expenses}" aria-label="${esc(label(d))}">
            <span class="cbars"><span class="cbar a" style="height:${h(d.revenue)}%"></span><span class="cbar b" style="height:${h(d.expenses)}%"></span></span>
          </button>`).join('')}
      </div>
    </div>
    <div class="chart-x" aria-hidden="true">${data.map((d) => `<span class="${d.key === sel.key ? 'sel' : ''}">${monthLabel(d.key, { short: !mini, mini, year: false })}</span>`).join('')}</div>
  </div>`;
}

function readout(d) {
  if (!d) return '';
  return `<strong>${esc(monthLabel(d.key))}</strong>
    <span><i class="lkey a"></i>${money(d.revenue)}</span>
    <span><i class="lkey b"></i>${money(d.expenses)}</span>`;
}

/** Klick auf eine Säule: Auswahl + Ablesezeile aktualisieren. onOpen(key) bei zweitem Tippen. */
export function bindChart(root, onOpen) {
  root.addEventListener('click', (e) => {
    const col = e.target.closest('.ccol');
    if (!col) return;
    const chart = col.closest('[data-chart]');
    const key = col.dataset.month;
    if (col.classList.contains('sel') && onOpen) { onOpen(key); return; }
    chart.querySelectorAll('.ccol').forEach((c) => c.classList.toggle('sel', c === col));
    const idx = [...chart.querySelectorAll('.ccol')].indexOf(col);
    chart.querySelectorAll('.chart-x span').forEach((s, i) => s.classList.toggle('sel', i === idx));
    chart.querySelector('[data-readout]').innerHTML = readout({ key, revenue: +col.dataset.rev, expenses: +col.dataset.exp });
  });
}

/** Rangliste mit dünnen Balken (eine Farbe) */
export function rankBars(rows, { valueFmt = (v) => money(v), sub = null, cls = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="ranks ${cls}">${rows.map((r) => `
    <div class="rank">
      <div class="rank-top"><span class="rank-name">${esc(r.label)}</span><span class="rank-val">${valueFmt(r.value)}</span></div>
      <div class="rank-track"><span style="width:${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%"></span></div>
      ${sub ? `<div class="rank-sub">${sub(r)}</div>` : ''}
    </div>`).join('')}</div>`;
}

export function statTile(label, value, cls = '', sub = '') {
  return `<div class="stat ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
}

export function navBar(title, backLabel, actions = '') {
  return `<div class="navbar">
    <button type="button" class="nav-back" data-action="back">${icon('chevL')}<span>${esc(backLabel)}</span></button>
    <span class="navbar-title">${esc(title)}</span>
    <span class="navbar-actions">${actions}</span>
  </div>`;
}

export const dateChip = (iso) => esc(fmtDate(iso));

/** Anteile als ein geteilter Balken mit Legende. rows: [{label, value}] (max. 3 Farben) */
export function shareBar(rows, total) {
  const keys = ['a', 'b', 'c'];
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return `<div class="share-bar" aria-hidden="true">${rows.map((r, i) => `<span class="${keys[i % 3]}" style="flex:${Math.max(1, r.value)}"></span>`).join('')}</div>
    <div class="share-legend">${rows.map((r, i) => `<div><i class="dot ${keys[i % 3]}"></i><span>${esc(r.label)}</span><strong>${money(r.value)}</strong><em>${pct(r.value)} %</em></div>`).join('')}</div>`;
}
