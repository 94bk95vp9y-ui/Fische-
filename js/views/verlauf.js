import { store, sortedEntries, getMonth, getEvent } from '../store.js';
import { esc, money, monthKey, monthLabel, centsToInput } from '../util.js';
import { icon } from '../icons.js';
import { entryRow, chips, empty } from '../components.js';
import { entryTitle, EXPENSE_CATS, CHANNELS } from '../model.js';
import { openEntryDetail, newEntryMenu } from '../sheets.js';

const FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'sale', label: 'Verkäufe' },
  { value: 'expense', label: 'Ausgaben' },
  { value: 'withdrawal', label: 'Entnahmen' },
  { value: 'other', label: 'Einlagen & Abgleich' },
  { value: 'open', label: 'Offen' },
];
let filter = 'all';
let query = '';
let limit = 150;

function matches(e) {
  if (filter === 'open') { if (e.status !== 'open') return false; }
  else if (filter === 'other') { if (e.type !== 'deposit' && e.type !== 'adjust') return false; }
  else if (filter !== 'all' && e.type !== filter) return false;
  if (!query) return true;
  const ev = e.eventId ? getEvent(e.eventId) : null;
  const hay = [
    entryTitle(e, store.state.events), e.note, ev && ev.name,
    e.type === 'expense' ? EXPENSE_CATS[e.category] : '',
    e.type === 'sale' ? (CHANNELS[e.channel] || {}).label : '',
    ...(e.items || []).map((i) => i.name),
    centsToInput(e.amount),
  ].filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function verlaufView(el) {
  function shell() {
    el.innerHTML = `
      <header class="lt">
        <div><h1>Verlauf</h1></div>
        <div class="lt-actions"><button type="button" class="nav-btn icon" data-action="new" aria-label="Neuer Eintrag">${icon('plus')}</button></div>
      </header>
      <div class="content">
        <label class="search">${icon('search')}<input type="search" placeholder="Suchen: Artikel, Notiz, Betrag …" value="${esc(query)}" data-search autocomplete="off" enterkeyhint="search"></label>
        <div class="contents" data-filters></div>
        <div data-list></div>
      </div>`;
  }
  // Nur Filter anzeigen, zu denen es auch Einträge gibt
  function renderFilters() {
    const es = store.state.entries;
    const has = {
      all: true,
      sale: es.some((e) => e.type === 'sale'),
      expense: es.some((e) => e.type === 'expense'),
      withdrawal: es.some((e) => e.type === 'withdrawal'),
      other: es.some((e) => e.type === 'deposit' || e.type === 'adjust'),
      open: es.some((e) => e.status === 'open'),
    };
    if (!has[filter]) filter = 'all';
    const list = FILTERS.filter((f) => has[f.value]);
    el.querySelector('[data-filters]').innerHTML = list.length > 2 ? chips('filter', list, filter, 'scroll') : '';
  }
  function renderList() {
    const list = el.querySelector('[data-list]');
    if (!list) return;
    renderFilters();
    const all = sortedEntries(store.state.entries.filter(matches));
    if (!store.state.entries.length) {
      list.innerHTML = empty('Noch keine Einträge', 'Verkäufe, Ausgaben und Entnahmen erscheinen hier – nach Monaten sortiert.',
        `<button type="button" class="btn primary" data-action="new">${icon('plus')}Eintrag hinzufügen</button>`);
      return;
    }
    if (!all.length) { list.innerHTML = '<p class="card-note center">Nichts gefunden.</p>'; return; }
    const shown = all.slice(0, limit);
    let html = '';
    let cur = null;
    for (const e of shown) {
      const k = monthKey(e.date);
      if (k !== cur) {
        if (cur) html += '</div></section>';
        const m = getMonth(k);
        html += `<section class="month-block"><div class="month-head stacked"><h2>${esc(monthLabel(k))}</h2>
          <span>Umsatz ${money(m.revenue)} · Ausgaben ${money(m.expenses)}</span></div><div class="card list">`;
        cur = k;
      }
      html += entryRow(e);
    }
    html += '</div></section>';
    if (all.length > limit) html += `<button type="button" class="btn block" data-action="more">Weitere ${Math.min(150, all.length - limit)} anzeigen</button>`;
    list.innerHTML = html;
  }
  function render() {
    if (!el.querySelector('[data-list]')) shell();
    renderList();
  }
  el.onclick = (e) => {
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
    const c = e.target.closest('[data-chips="filter"] [data-value]');
    if (c) {
      filter = c.dataset.value; limit = 150;
      c.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      renderList();
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'new') newEntryMenu();
    if (a.dataset.action === 'more') { limit += 150; renderList(); }
  };
  el.oninput = (e) => {
    if (e.target.matches('[data-search]')) { query = e.target.value.trim(); limit = 150; renderList(); }
  };
  return { render, fresh: () => { el.innerHTML = ''; } };
}
