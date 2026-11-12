import { store, getMonth, yearTotals, monthKeys, productRanking, sortedEntries, getProduct, getTotals } from '../store.js';
import { esc, money, monthLabel, monthKey, currentMonthKey, pct } from '../util.js';
import { icon } from '../icons.js';
import { monthChart, bindChart, statTile, rankBars, shareBar, navBar, entryRow, thumb, empty } from '../components.js';
import { CHANNELS, EXPENSE_CATS } from '../model.js';
import { openEntryDetail } from '../sheets.js';
import { go, back } from '../nav.js';

function channelBars(byChannel, total) {
  const rows = Object.keys(CHANNELS).map((k) => ({ label: CHANNELS[k].label, value: byChannel[k] || 0 })).filter((r) => r.value > 0);
  if (!rows.length) return '<p class="card-note">Noch keine Verkäufe.</p>';
  return shareBar(rows.sort((a, b) => b.value - a.value), total);
}
function expenseBars(byExpense) {
  const rows = Object.keys(byExpense).map((k) => ({ label: EXPENSE_CATS[k] || 'Sonstiges', value: byExpense[k] })).filter((r) => r.value > 0);
  if (!rows.length) return '<p class="card-note">Keine Ausgaben.</p>';
  return rankBars(rows.sort((a, b) => b.value - a.value), { cls: 'warm' });
}
function topList(rows) {
  if (!rows.length) return '<p class="card-note">Noch keine Verkäufe mit Artikeln.</p>';
  return `<div class="list">${rows.map((r, i) => {
    const p = r.pid ? getProduct(r.pid) : null;
    return `<div class="row static"><span class="place">${i + 1}</span>${thumb(p || { category: 'sonstiges' }, 'sm')}<span class="rmain"><span class="rtitle">${esc(r.name)}</span><span class="rsub">${r.qty} Stück</span></span><span class="ramt">${money(r.revenue)}</span></div>`;
  }).join('')}</div>`;
}

/** Zusätzliche Kennzahlen als klar beschriftete Zeilen */
function detailRows(t, { withDeposits = false } = {}) {
  const row = (k, v, sub = '') => `<div class="kv"><span>${k}${sub ? `<small>${sub}</small>` : ''}</span><span>${v}</span></div>`;
  return `<div class="kv-list">
    ${row('Verkäufe', String(t.sales), t.lumpSales ? `plus ${t.lumpSales} Messe-Tagessumme${t.lumpSales === 1 ? '' : 'n'}` : '')}
    ${row('Ø pro Verkauf', t.avgSale != null ? money(t.avgSale) : '–', t.lumpSales ? 'ohne Messe-Tagessummen' : '')}
    ${t.items ? row('Verkaufte Tiere/Artikel', String(t.items)) : ''}
    ${row('Privat entnommen', money(t.withdrawals))}
    ${withDeposits ? row('Einlagen', money(t.deposits)) : ''}
  </div>`;
}

// ------------------------------------------------------------------
export function statsView(el, params) {
  const years = () => {
    const ys = new Set(monthKeys().map((k) => k.slice(0, 4)));
    ys.add(currentMonthKey().slice(0, 4));
    return [...ys].sort();
  };
  let year = params[0] || currentMonthKey().slice(0, 4);

  function render() {
    const ys = years();
    if (!ys.includes(year)) year = ys[ys.length - 1];
    const i = ys.indexOf(year);
    const t = yearTotals(year);
    const months = Array.from({ length: 12 }, (_, m) => {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      const x = getMonth(key);
      return { key, ...x };
    });
    const cmk = currentMonthKey();
    const sel = year === cmk.slice(0, 4) ? cmk : `${year}-12`;
    const firstKey = monthKeys().find((k) => k.startsWith(year + '-'));
    const visible = months.filter((m) => m.key <= cmk && firstKey && m.key >= firstKey);
    const top = productRanking((e) => e.date.startsWith(year + '-')).slice(0, 8);
    const all = getTotals();

    if (!store.state.entries.length) {
      el.innerHTML = `<header class="lt"><div><h1>Statistik</h1></div></header>
        <div class="content">${empty('Noch keine Zahlen', 'Sobald du Verkäufe oder Ausgaben einträgst, siehst du hier Monate, Jahre und deine Bestseller.', '', 'chart')}</div>`;
      return;
    }
    el.innerHTML = `
      <header class="lt">
        <div><h1>Statistik</h1></div>
        <div class="year-switch">
          <button type="button" class="icon-btn" data-year="${esc(ys[i - 1] || '')}" ${i > 0 ? '' : 'disabled'} aria-label="Vorjahr">${icon('chevL')}</button>
          <strong>${esc(year)}</strong>
          <button type="button" class="icon-btn" data-year="${esc(ys[i + 1] || '')}" ${i < ys.length - 1 ? '' : 'disabled'} aria-label="Folgejahr">${icon('chevR')}</button>
        </div>
      </header>
      <div class="content">
        <section class="card">
          ${statTile(`Gewinn ${esc(year)}`, money(t.profit), 'big ' + (t.profit < 0 ? 'neg' : ''))}
          <div class="stats2">
            ${statTile('<i class="dot"></i>Umsatz', money(t.revenue))}
            ${statTile('<i class="dot b"></i>Ausgaben', money(t.expenses))}
          </div>
          ${monthChart(months.map((m) => ({ key: m.key, revenue: m.revenue, expenses: m.expenses })), sel, { mini: true })}
          <p class="card-note">Säule antippen zeigt die Werte, nochmal antippen öffnet den Monat.</p>
        </section>
        <div class="card list">${detailRows(t)}</div>

        <section class="month-block">
          <div class="month-head"><h2>Monate</h2></div>
          <div class="card table-card">
            <div class="mt-row mt-head"><span>Monat</span><span>Umsatz</span><span>Ausgaben</span><span>Gewinn</span></div>
            ${visible.slice().reverse().map((m) => `
              <button type="button" class="mt-row" data-month="${m.key}">
                <span>${esc(monthLabel(m.key, { year: false }))}</span>
                <span>${money(m.revenue)}</span>
                <span>${money(m.expenses)}</span>
                <span class="${m.revenue - m.expenses < 0 ? 'neg' : ''}">${money(m.revenue - m.expenses)}</span>
              </button>`).join('') || '<p class="card-note">Keine Daten.</p>'}
            <div class="mt-row mt-foot"><span>Summe</span><span>${money(t.revenue)}</span><span>${money(t.expenses)}</span><span class="${t.profit < 0 ? 'neg' : ''}">${money(t.profit)}</span></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Umsatz nach Verkaufsweg</h2></div>
          ${channelBars(t.byChannel, t.revenue)}
        </section>

        <section class="card">
          <div class="card-head"><h2>Ausgaben nach Kategorie</h2></div>
          ${expenseBars(t.byExpense)}
        </section>

        <section class="card">
          <div class="card-head"><h2>Meistverkauft ${esc(year)}</h2></div>
          ${topList(top)}
        </section>

        <section class="sec">
          <div class="sec-head"><h2>Seit Beginn</h2></div>
          <div class="card">
            <div class="stats3">
              ${statTile('Umsatz', money(all.revenue))}
              ${statTile('Ausgaben', money(all.expenses))}
              ${statTile('Gewinn', money(all.profit), all.profit < 0 ? 'neg' : '')}
            </div>
          </div>
          <div class="card list">${detailRows(all, { withDeposits: true })}</div>
        </section>
      </div>`;
  }
  bindChart(el, (key) => go('monat/' + key));
  el.onclick = (e) => {
    const y = e.target.closest('[data-year]');
    if (y && y.dataset.year) { year = y.dataset.year; render(); window.scrollTo(0, 0); return; }
    const mo = e.target.closest('.mt-row[data-month]');
    if (mo) { go('monat/' + mo.dataset.month); return; }
  };
  return { render };
}

// ------------------------------------------------------------------
export function monthView(el, params) {
  const key = params[0];
  function render() {
    const m = getMonth(key);
    const list = sortedEntries(store.state.entries.filter((e) => monthKey(e.date) === key));
    const top = productRanking((e) => monthKey(e.date) === key).slice(0, 5);
    el.innerHTML = `
      ${navBar(monthLabel(key), 'Statistik')}
      <header class="lt compact"><div><h1>${esc(monthLabel(key, { year: false }))}</h1><p class="lt-sub">${esc(key.slice(0, 4))}</p></div></header>
      <div class="content">
        <section class="card">
          <div class="stats3">
            ${statTile('Umsatz', money(m.revenue))}
            ${statTile('Ausgaben', money(m.expenses))}
            ${statTile('Gewinn', money(m.profit), m.profit < 0 ? 'neg' : '')}
          </div>
        </section>
        <div class="card list">${detailRows(m)}</div>
        ${m.revenue ? `<section class="card"><div class="card-head"><h2>Verkaufsweg</h2></div>${channelBars(m.byChannel, m.revenue)}</section>` : ''}
        ${top.length ? `<section class="card"><div class="card-head"><h2>Meistverkauft</h2></div>${topList(top)}</section>` : ''}
        <section class="month-block">
          <div class="month-head"><h2>Einträge</h2><span>${list.length}</span></div>
          ${list.length ? `<div class="card list">${list.map((e) => entryRow(e)).join('')}</div>` : '<p class="card-note">Keine Einträge in diesem Monat.</p>'}
        </section>
      </div>`;
  }
  el.onclick = (e) => {
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
    if (e.target.closest('[data-action="back"]')) back('statistik/' + key.slice(0, 4));
  };
  return { render };
}
