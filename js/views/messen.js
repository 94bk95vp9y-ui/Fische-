import { store, commit, sortedEvents, eventStats, getEvent, sortedEntries, productRanking, getProduct } from '../store.js';
import { esc, money, fmtDate, fmtDateLong } from '../util.js';
import { icon } from '../icons.js';
import { navBar, statTile, entryRow, empty, thumb } from '../components.js';
import { openEventForm, openEntryForm, openEntryDetail } from '../sheets.js';
import { actionSheet, undoToast } from '../ui.js';
import { returnStock } from '../model.js';
import { go, back } from '../nav.js';

export function messenView(el) {
  function render() {
    const evs = sortedEvents();
    const activeId = store.state.settings.activeEventId;
    let sumProfit = 0;
    el.innerHTML = `
      ${navBar('Messen & Börsen', 'Mehr', `<button type="button" class="nav-btn icon solid" data-action="new" aria-label="Neue Messe">${icon('plus')}</button>`)}
      <header class="lt compact"><div><h1>Messen & Börsen</h1></div></header>
      <div class="content">
        ${evs.length ? `<div class="card list">${evs.map((ev) => {
          const st = eventStats(ev.id);
          sumProfit += st.profit;
          return `<button type="button" class="row" data-ev="${esc(ev.id)}">
            <span class="ricon t-messe">${icon('stall')}</span>
            <span class="rmain"><span class="rtitle">${esc(ev.name)}${ev.id === activeId ? ' <em class="pill accent">aktiv</em>' : ''}</span>
              <span class="rsub">${esc(fmtDate(ev.date, { year: true }))}${ev.place ? ' · ' + esc(ev.place) : ''} · Umsatz ${money(st.revenue)}</span></span>
            <span class="ramt ${st.profit < 0 ? 'neg' : ''}">${money(st.profit)}<small>Gewinn</small></span>
          </button>`;
        }).join('')}</div>
        <p class="hint">Gewinn = Einnahmen der Messe − zugeordnete Kosten (Standgebühr, Fahrt …). Summe aller Messen: <strong>${money(sumProfit)}</strong></p>`
        : empty('Noch keine Messe', 'Lege eine Messe oder Börse an. Du kannst die Tageseinnahmen direkt eintragen oder vor Ort jeden Verkauf in der Kasse zählen.',
          `<button type="button" class="btn primary" data-action="new">${icon('plus')}Messe anlegen</button>`, 'stall')}
      </div>`;
  }
  el.onclick = (e) => {
    const r = e.target.closest('[data-ev]');
    if (r) { go('messe/' + r.dataset.ev); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'new') openEventForm();
    if (a.dataset.action === 'back') back('mehr');
  };
  return { render };
}

export function messeView(el, params) {
  const id = params[0];
  function render() {
    const ev = getEvent(id);
    if (!ev) {
      el.innerHTML = `${navBar('Messe', 'Messen')}<div class="content">${empty('Messe nicht gefunden', 'Sie wurde vermutlich gelöscht.')}</div>`;
      return;
    }
    const st = eventStats(id);
    const active = store.state.settings.activeEventId === id;
    const list = sortedEntries(store.state.entries.filter((e) => e.eventId === id));
    const top = productRanking((e) => e.eventId === id);
    el.innerHTML = `
      ${navBar(ev.name, 'Messen', `<button type="button" class="nav-btn" data-action="edit">Bearbeiten</button>`)}
      <header class="lt compact"><div><h1>${esc(ev.name)}</h1><p class="lt-sub">${esc(fmtDateLong(ev.date))}${ev.place ? ' · ' + esc(ev.place) : ''}</p></div></header>
      <div class="content">
        <section class="card">
          <div class="stats3">
            ${statTile('Einnahmen', money(st.revenue))}
            ${statTile('Kosten', money(st.costs))}
            ${statTile('Gewinn', money(st.profit), st.profit < 0 ? 'neg' : '')}
          </div>
          <p class="card-note">${st.sales} ${st.sales === 1 ? 'Verkauf' : 'Verkäufe'} zugeordnet.</p>
        </section>

        <button type="button" class="btn ${active ? '' : 'primary'} block" data-action="toggle">
          ${icon(active ? 'stop' : 'play')}${active ? 'Messe-Modus beenden' : 'Messe-Modus starten'}
        </button>
        <p class="hint center">${active ? 'Alle Verkäufe in der Kasse werden gerade dieser Messe zugeordnet.' : 'Im Messe-Modus werden Verkäufe in der Kasse automatisch dieser Messe zugeordnet.'}</p>

        <div class="btn-row">
          <button type="button" class="btn" data-action="add-rev">${icon('arrowDown')}Einnahme</button>
          <button type="button" class="btn" data-action="add-cost">${icon('arrowUp')}Kosten</button>
          <button type="button" class="btn" data-action="kasse">${icon('basket')}Zur Kasse</button>
        </div>

        ${top.length ? `<section class="card"><div class="card-head"><h2>Verkauft</h2></div>
          <div class="list">${top.map((r) => {
            const p = r.pid ? getProduct(r.pid) : null;
            return `<div class="row static">${thumb(p || { category: 'sonstiges' }, 'sm')}<span class="rmain"><span class="rtitle">${esc(r.name)}</span><span class="rsub">${r.qty} Stück</span></span><span class="ramt">${money(r.revenue)}</span></div>`;
          }).join('')}</div></section>` : ''}

        <section class="month-block">
          <div class="month-head"><h2>Einträge</h2><span>${list.length}</span></div>
          ${list.length ? `<div class="card list">${list.map((e) => entryRow(e)).join('')}</div>` : '<p class="hint">Noch nichts zugeordnet.</p>'}
        </section>

        <button type="button" class="btn danger block" data-action="delete">${icon('trash')}Messe löschen</button>
      </div>`;
  }
  el.onclick = async (e) => {
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const ev = getEvent(id);
    switch (a.dataset.action) {
      case 'back': back('messen'); break;
      case 'edit': if (ev) openEventForm(ev); break;
      case 'toggle':
        commit((s) => { s.settings.activeEventId = s.settings.activeEventId === id ? null : id; });
        break;
      case 'add-rev': openEntryForm({ type: 'sale', preset: { channel: 'messe', eventId: id, date: ev.date } }); break;
      case 'add-cost': openEntryForm({ type: 'expense', preset: { category: 'messe', eventId: id, date: ev.date } }); break;
      case 'kasse':
        if (store.state.settings.activeEventId !== id) commit((s) => { s.settings.activeEventId = id; });
        go('kasse');
        break;
      case 'delete': {
        const n = store.state.entries.filter((x) => x.eventId === id).length;
        const r = await actionSheet({
          title: `„${ev.name}“ löschen?`,
          message: n ? `${n} Einträge sind dieser Messe zugeordnet.` : '',
          actions: n
            ? [{ label: 'Nur Messe löschen, Einträge behalten', value: 'keep', style: 'destructive' },
               { label: `Messe und ${n} Einträge löschen`, value: 'all', style: 'destructive' }]
            : [{ label: 'Messe löschen', value: 'keep', style: 'destructive' }],
        });
        if (!r) return;
        const undo = commit((s) => {
          s.events = s.events.filter((x) => x.id !== id);
          if (s.settings.activeEventId === id) s.settings.activeEventId = null;
          if (r === 'all') {
            for (const x of s.entries.filter((y) => y.eventId === id)) {
              for (const i of x.items || []) returnStock(s.products.find((q) => q.id === i.pid), i);
            }
            s.entries = s.entries.filter((x) => x.eventId !== id);
          } else {
            for (const x of s.entries) if (x.eventId === id) delete x.eventId;
          }
        });
        back('messen');
        undoToast('Messe gelöscht', undo);
        break;
      }
    }
  };
  return { render };
}
