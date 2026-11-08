import { commit, sortedProducts, productRanking } from '../store.js';
import { esc, money } from '../util.js';
import { icon } from '../icons.js';
import { thumb, catLabel, empty } from '../components.js';
import { openProductEditor, openAiImport } from '../products.js';
import { actionSheet } from '../ui.js';

let sorting = false;

export function artikelView(el) {
  function row(p, list, sold) {
    const idx = list.indexOf(p);
    const n = sold.get(p.id) || 0;
    return `<div class="row prod ${p.active ? '' : 'inactive'}" data-pid="${esc(p.id)}">
      <button type="button" class="prod-main" data-edit="${esc(p.id)}">
        ${thumb(p)}
        <span class="rmain">
          <span class="rtitle">${esc(p.name)}</span>
          <span class="rsub">${esc(catLabel(p.category))}${p.stock != null ? ` · ${p.stock > 0 ? `${p.stock} da` : 'ausverkauft'}` : ''}${n ? ` · ${n} verkauft` : ''}</span>
        </span>
        <span class="prod-price">${money(p.price)}${p.tiers && p.tiers.length ? `<small>ab ${p.tiers[0].min}: ${money(p.tiers[0].price)}</small>` : ''}</span>
      </button>
      ${sorting ? `<span class="sort-btns">
        <button type="button" class="icon-btn" data-move="-1" data-id="${esc(p.id)}" ${idx === 0 ? 'disabled' : ''} aria-label="nach oben">${icon('up')}</button>
        <button type="button" class="icon-btn" data-move="1" data-id="${esc(p.id)}" ${idx === list.length - 1 ? 'disabled' : ''} aria-label="nach unten">${icon('down')}</button>
      </span>` : ''}
    </div>`;
  }

  function render() {
    const all = sortedProducts();
    const active = all.filter((p) => p.active);
    const inactive = all.filter((p) => !p.active);
    const soldCount = new Map(productRanking().map((r) => [r.pid, r.qty]));
    el.innerHTML = `
      <header class="lt">
        <div><h1>Artikel</h1></div>
        <div class="lt-actions">
          ${all.length > 1 ? `<button type="button" class="nav-btn" data-action="sort">${sorting ? 'Fertig' : 'Sortieren'}</button>` : ''}
          <button type="button" class="nav-btn icon" data-action="add" aria-label="Artikel hinzufügen">${icon('plus')}</button>
        </div>
      </header>
      <div class="content">
        <button type="button" class="card import-card" data-action="ai">
          <span class="import-ic">${icon('paste')}</span>
          <span class="rmain"><span class="rtitle">Aus Anzeige übernehmen</span>
          <span class="rsub">Name, Preis & Mengenrabatt per KI aus deiner Kleinanzeigen-Anzeige</span></span>
          ${icon('chevR', 'chev')}
        </button>
        ${all.length ? `
          ${sorting ? '<p class="card-note">Reihenfolge = Reihenfolge der Kacheln in der Kasse.</p>' : ''}
          <section class="month-block"><div class="month-head"><h2>In der Kasse</h2><span>${active.length}</span></div>
            <div class="card list">${active.map((p) => row(p, active, soldCount)).join('') || '<p class="card-note">Alle Artikel sind archiviert.</p>'}</div>
          </section>
          ${inactive.length ? `<section class="month-block"><div class="month-head"><h2>Archiviert</h2><span>${inactive.length}</span></div>
            <div class="card list">${inactive.map((p) => row(p, inactive, soldCount)).join('')}</div></section>` : ''}
          <p class="hint center">Preis ändern: Artikel antippen. Bisherige Verkäufe behalten ihren Preis.</p>
        ` : empty('Noch keine Artikel', 'Lege die Tiere und Sachen an, die du verkaufst – mit Stückpreis und gern mit Foto.',
          `<button type="button" class="btn primary" data-action="new">${icon('plus')}Artikel anlegen</button>`)}
      </div>`;
  }

  el.onclick = async (e) => {
    const mv = e.target.closest('[data-move]');
    if (mv) { move(mv.dataset.id, +mv.dataset.move); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { if (!sorting) openProductEditor(ed.dataset.edit); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'sort': sorting = !sorting; render(); break;
      case 'new': openProductEditor(null); break;
      case 'ai': openAiImport(); break;
      case 'add': {
        const r = await actionSheet({ actions: [
          { label: 'Neuen Artikel anlegen', value: 'new', icon: 'plus' },
          { label: 'Aus Anzeige übernehmen (KI)', value: 'ai', icon: 'paste' },
        ] });
        if (r === 'new') openProductEditor(null);
        if (r === 'ai') openAiImport();
        break;
      }
    }
  };

  function move(id, dir) {
    commit((s) => {
      const p = s.products.find((x) => x.id === id);
      if (!p) return;
      const group = [...s.products].filter((x) => x.active === p.active).sort((a, b) => a.order - b.order);
      const i = group.indexOf(p), j = i + dir;
      if (j < 0 || j >= group.length) return;
      [group[i], group[j]] = [group[j], group[i]];
      // Reihenfolge neu durchnummerieren (alle Artikel, aktive zuerst)
      const others = s.products.filter((x) => x.active !== p.active).sort((a, b) => a.order - b.order);
      const ordered = p.active ? [...group, ...others] : [...others, ...group];
      ordered.forEach((x, k) => { x.order = k; });
    });
  }
  return { render };
}

