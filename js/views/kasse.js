import { commit, activeProducts, activeEvent, getProduct } from '../store.js';
import { money, esc } from '../util.js';
import { icon, CAT_GLYPH } from '../icons.js';
import { thumb, empty } from '../components.js';
import { PRODUCT_CATS, unitPriceFor, sortedTiers, freeFor } from '../model.js';
import { openCheckout, openEntryForm, openQtyPad } from '../sheets.js';
import { openProductEditor, openAiImport } from '../products.js';
import { go } from '../nav.js';

// Warenkorb überlebt das Schließen der App (z. B. kurz zu Kleinanzeigen wechseln)
const CART_KEY = 'fk-cart';
let cart = {};
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch { cart = {}; }
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* egal */ } };
let cat = 'all';
let query = '';

export function cartCount() {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

function lines() {
  const out = [];
  for (const p of activeProducts()) {
    const qty = cart[p.id] || 0;
    if (qty > 0) {
      const unit = unitPriceFor(p, qty);
      out.push({ product: p, qty, unit, total: unit * qty, free: freeFor(p.bonus, qty) });
    }
  }
  return out;
}

function stockBadge(p) {
  if (p.stock == null) return '';
  if (p.stock <= 0) return '<span class="tile-stock none">ausverkauft</span>';
  return `<span class="tile-stock ${p.stock <= 3 ? 'low' : ''}">${p.stock} da</span>`;
}

export function kasseView(el, _params, { onCartChange } = {}) {
  function cleanCart() {
    const ids = new Set(activeProducts().map((p) => p.id));
    let changed = false;
    for (const id of Object.keys(cart)) if (!ids.has(id) || !(cart[id] > 0)) { delete cart[id]; changed = true; }
    if (changed) saveCart();
  }

  function tileHtml(p) {
    const qty = cart[p.id] || 0;
    const tiers = sortedTiers(p.tiers);
    const unit = unitPriceFor(p, Math.max(1, qty));
    const id = esc(p.id);
    const free = freeFor(p.bonus, qty);
    const deal = [];
    if (tiers.length) deal.push(`ab ${tiers[0].min}: ${money(tiers[0].price)}`);
    if (p.bonus) deal.push(`je ${p.bonus.per}: +${p.bonus.free} gratis`);
    return `<div class="tile ${qty ? 'on' : ''} ${p.stock != null && qty + free > p.stock ? 'over' : ''} ${p.stock != null && p.stock <= 0 ? 'out' : ''}" data-pid="${id}">
      <div class="tile-media">
        <button type="button" class="tile-hit" data-add="${id}" aria-label="${esc(p.name)}, ${esc(money(p.price))} – hinzufügen">${thumb(p, 'tile-img')}</button>
        ${stockBadge(p)}
        <span class="tile-qty" aria-hidden="true">${qty || ''}</span>
        <span class="tile-free" ${free ? '' : 'hidden'}>+${free} gratis</span>
        <div class="tile-step">
          <button type="button" data-dec="${id}" aria-label="eins weniger">${icon('minus')}</button>
          <button type="button" class="tile-count" data-qty="${id}" aria-label="Menge eingeben">${qty}</button>
          <button type="button" data-add="${id}" aria-label="eins mehr">${icon('plus')}</button>
        </div>
      </div>
      <div class="tile-info" data-add="${id}">
        <span class="tile-name">${esc(p.name)}</span>
        <span class="tile-price ${unit !== p.price ? 'staffel' : ''}"><b>${money(unit)}</b>${deal.length ? `<small>${deal.join(' · ')}</small>` : ''}</span>
      </div>
    </div>`;
  }

  function filtered() {
    let list = activeProducts();
    if (cat !== 'all') list = list.filter((p) => p.category === cat);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }

  function catChips(cats) {
    const chip = (value, label, ic) => `<button type="button" class="chip ${value === cat ? 'on' : ''}" aria-pressed="${value === cat}" data-value="${esc(value)}">${ic ? icon(ic) : ''}${esc(label)}</button>`;
    return `<div class="chips scroll" data-chips="cat">${chip('all', 'Alle', '')}${cats.map((c) => chip(c, (PRODUCT_CATS[c] || PRODUCT_CATS.sonstiges).plural, CAT_GLYPH[c] || 'box')).join('')}</div>`;
  }

  function render() {
    cleanCart();
    const all = activeProducts();
    const ev = activeEvent();
    const cats = [...new Set(all.map((p) => p.category))];
    if (cat !== 'all' && !cats.includes(cat)) cat = 'all';
    const list = filtered();

    el.innerHTML = `
      <header class="lt">
        <div><h1>Kasse</h1></div>
        <div class="lt-actions">
          <button type="button" class="nav-btn" data-action="clear" ${cartCount() ? '' : 'hidden'}>Leeren</button>
          <button type="button" class="nav-btn" data-action="manual" ${cartCount() ? 'hidden' : ''}>${icon('euro')}Nur Betrag</button>
          ${all.length ? `<button type="button" class="nav-btn icon" data-action="manage" aria-label="Artikel verwalten">${icon('sliders')}</button>` : ''}
        </div>
      </header>
      <div class="content kasse">
        ${ev ? `<div class="banner accent">${icon('stall')}<span><strong>Messe-Modus:</strong> ${esc(ev.name)} – Verkäufe werden der Messe zugeordnet.</span>
          <button type="button" class="banner-link" data-action="end-messe">Beenden</button></div>` : ''}
        ${all.length ? `
          ${all.length > 8 ? `<label class="search">${icon('search')}<input type="search" placeholder="Artikel suchen" value="${esc(query)}" data-search autocomplete="off" enterkeyhint="search" aria-label="Artikel suchen"></label>` : ''}
          ${cats.length > 1 ? catChips(cats) : ''}
          <div class="tiles" data-tiles>${list.map(tileHtml).join('') || '<p class="card-note">Keine Treffer.</p>'}</div>
          <p class="kasse-tip">Antippen = +1 · Zahl antippen = Menge eintippen<br>Verkauf ohne Artikel: oben „Nur Betrag“</p>
        ` : empty('Noch keine Artikel', 'Lege an, was du verkaufst – mit Stückpreis und Foto. Dann tippst du hier einfach an, was der Kunde mitnimmt.',
          `<div class="btn-row center"><button type="button" class="btn primary" data-action="new-product">${icon('plus')}Artikel anlegen</button><button type="button" class="btn" data-action="ai-import">Aus Anzeige</button></div>`)}
      </div>
      <div class="dock" data-dock></div>`;
    updateBar();
  }

  function updateTiles() {
    el.querySelectorAll('.tile[data-pid]').forEach((t) => {
      const p = getProduct(t.dataset.pid);
      if (!p) return;
      const qty = cart[p.id] || 0;
      t.classList.toggle('on', qty > 0);
      const free = freeFor(p.bonus, qty);
      t.classList.toggle('over', p.stock != null && qty + free > p.stock);
      const fr = t.querySelector('.tile-free');
      fr.hidden = !free;
      fr.textContent = `+${free} gratis`;
      t.querySelector('.tile-qty').textContent = qty || '';
      t.querySelector('.tile-count').textContent = qty;
      const unit = unitPriceFor(p, Math.max(1, qty));
      const price = t.querySelector('.tile-price');
      price.classList.toggle('staffel', unit !== p.price);
      price.querySelector('b').textContent = money(unit);
    });
  }

  function updateBar() {
    const bar = el.querySelector('[data-dock]');
    if (!bar) return;
    const ls = lines();
    const n = ls.reduce((a, l) => a + l.qty, 0);
    const gratis = ls.reduce((a, l) => a + l.free, 0);
    const total = ls.reduce((a, l) => a + l.total, 0);
    // Leerer Warenkorb: Leiste ausblenden, damit die Kacheln frei bleiben
    bar.classList.toggle('show', n > 0);
    if (n) {
      bar.innerHTML = `<div class="dock-info"><span class="dock-count">${n} Stück${gratis ? ` + ${gratis} gratis` : ls.length > 1 ? ` · ${ls.length} Sorten` : ''}</span><span class="dock-total">${money(total)}</span></div>
        <button type="button" class="btn primary" data-action="checkout">Kassieren${icon('arrowR')}</button>`;
    }
    document.body.classList.toggle('has-cart', n > 0);
    const clear = el.querySelector('[data-action="clear"]');
    if (clear) clear.hidden = !n;
    const manual = el.querySelector('.lt-actions [data-action="manual"]');
    if (manual) manual.hidden = n > 0;
    onCartChange && onCartChange(n);
  }

  function setQty(pid, qty) {
    if (qty > 0) cart[pid] = Math.min(9999, qty); else delete cart[pid];
    saveCart();
    updateTiles();
    updateBar();
  }

  function bump(pid) {
    const t = el.querySelector(`.tile[data-pid="${CSS.escape(pid)}"] .tile-qty`);
    if (!t) return;
    t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
  }

  el.onclick = (e) => {
    const dec = e.target.closest('[data-dec]');
    if (dec) { const id = dec.dataset.dec; setQty(id, (cart[id] || 0) - 1); return; }
    const q = e.target.closest('[data-qty]');
    if (q) { const p = getProduct(q.dataset.qty); if (p) openQtyPad(p, cart[p.id] || 0, (n) => setQty(p.id, n)); return; }
    const add = e.target.closest('[data-add]');
    if (add) { const id = add.dataset.add; setQty(id, (cart[id] || 0) + 1); bump(id); return; }
    const c = e.target.closest('[data-chips="cat"] [data-value]');
    if (c) { cat = c.dataset.value; render(); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'clear': cart = {}; saveCart(); updateTiles(); updateBar(); break;
      case 'manage': go('artikel'); break;
      case 'manual': openEntryForm({ type: 'sale' }); break;
      case 'new-product': openProductEditor(null); break;
      case 'ai-import': openAiImport(); break;
      case 'end-messe': commit((s) => { s.settings.activeEventId = null; }); break;
      case 'checkout': {
        const ls = lines();
        if (!ls.length) return;
        openCheckout(ls, (undo, restore) => {
          if (restore) { for (const l of restore) cart[l.product.id] = l.qty; }
          else cart = {};
          saveCart();
          render();
        });
        break;
      }
    }
  };
  el.oninput = (e) => {
    if (e.target.matches('[data-search]')) {
      query = e.target.value.trim();
      const tiles = el.querySelector('[data-tiles]');
      if (tiles) tiles.innerHTML = filtered().map(tileHtml).join('') || '<p class="card-note">Keine Treffer.</p>';
    }
  };
  return { render };
}
