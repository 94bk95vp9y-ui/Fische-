import { store, getMonth, yearTotals, monthKeys, productRanking, sortedEntries, getProduct, getTotals } from '../store.js';
import { esc, money, monthLabel, monthKey, currentMonthKey, addMonths, pct } from '../util.js';
import { icon } from '../icons.js';
import { monthChart, bindChart, statTile, rankBars, shareBar, navBar, entryRow, thumb, empty, seg } from '../components.js';
import { CHANNELS, EXPENSE_CATS, FEE_NAME } from '../model.js';
import { openEntryDetail } from '../sheets.js';
import { go, back } from '../nav.js';

let range = 'year'; // 'year' | 'last12' – nur fürs laufende Jahr umschaltbar

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

/**
 * Umsatz / Abgabe / Ausgaben / Gewinn. Sobald es eine Abgabe gibt, steht sie als eigene
 * Zahl dabei – sonst ginge die Rechnung „Umsatz − Ausgaben = Gewinn“ für den Leser nicht auf.
 */
function sumTiles(t) {
  const tiles = [statTile('<i class="dot"></i>Umsatz', money(t.revenue))];
  if (t.fees) tiles.push(statTile(`<i class="dot c"></i>${FEE_NAME}`, money(t.fees)));
  tiles.push(statTile('<i class="dot b"></i>Ausgaben', money(t.expenses)));
  tiles.push(statTile('Gewinn', money(t.profit), t.profit < 0 ? 'neg' : ''));
  return `<div class="${t.fees ? 'stats4' : 'stats3'}">${tiles.join('')}</div>`;
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

/** Laufender Monat – mit Balken „wie viel vom Umsatz bleibt“ */
function monthCard(mk) {
  const m = getMonth(mk);
  const pm = getMonth(addMonths(mk, -1));
  const delta = pm.revenue > 0 ? pct(m.revenue - pm.revenue, pm.revenue) : null;
  const gone = m.expenses + m.fees;
  const spent = m.revenue > 0 ? Math.min(100, (gone / m.revenue) * 100) : (gone > 0 ? 100 : 0);
  const note = [`${m.sales} ${m.sales === 1 ? 'Verkauf' : 'Verkäufe'}`];
  if (m.lumpSales) note.push(`${m.lumpSales} ${m.lumpSales === 1 ? 'Messetag' : 'Messetage'}`);
  return `<section class="sec">
    <div class="sec-head"><h2>${esc(monthLabel(mk, { year: false }))}</h2><button type="button" class="link" data-month="${mk}">Details ${icon('chevR', 'ic-sm')}</button></div>
    <button type="button" class="card month-card" data-month="${mk}">
      ${sumTiles(m)}
      <span class="split-bar ${m.revenue > 0 ? 'has' : ''}" aria-hidden="true">${spent > 0 ? `<span style="width:${spent.toFixed(1)}%"></span>` : ''}</span>
      <span class="month-foot">
        <span>${esc(note.join(' · '))}</span>
        ${delta !== null ? `<span class="delta ${delta < 0 ? 'down' : ''}">${icon(delta < 0 ? 'arrowDown' : 'arrowUp')}${Math.abs(delta)} % ggü. ${esc(monthLabel(addMonths(mk, -1), { year: false }))}</span>` : ''}
      </span>
    </button>
  </section>`;
}

function sumMonths(months) {
  const t = { revenue: 0, expenses: 0, fees: 0 };
  for (const m of months) { t.revenue += m.revenue; t.expenses += m.expenses; t.fees += m.fees; }
  t.profit = t.revenue - t.expenses - t.fees;
  return t;
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
    const cmk = currentMonthKey();
    const isNow = year === cmk.slice(0, 4);
    const rolling = isNow && range === 'last12';
    const t = yearTotals(year);
    const keys = rolling
      ? Array.from({ length: 12 }, (_, m) => addMonths(cmk, m - 11))
      : Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, '0')}`);
    const months = keys.map((key) => ({ key, ...getMonth(key) }));
    const head = rolling ? sumMonths(months) : t;
    const sel = isNow ? cmk : `${year}-12`;
    const firstKey = monthKeys()[0];
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
        ${isNow ? monthCard(cmk) : ''}

        <section class="sec">
          <div class="sec-head"><h2>${rolling ? 'Letzte 12 Monate' : `Jahr ${esc(year)}`}</h2></div>
          ${isNow ? seg('range', [{ value: 'year', label: `Jahr ${year}` }, { value: 'last12', label: 'Letzte 12 Monate' }], range) : ''}
          <div class="card">
            ${statTile('Gewinn', money(head.profit), 'big ' + (head.profit < 0 ? 'neg' : ''))}
            <div class="${head.fees ? 'stats3' : 'stats2'} stats-sub">
              ${statTile('<i class="dot"></i>Umsatz', money(head.revenue))}
              ${head.fees ? statTile(`<i class="dot c"></i>${FEE_NAME}`, money(head.fees)) : ''}
              ${statTile('<i class="dot b"></i>Ausgaben', money(head.expenses))}
            </div>
            ${monthChart(months.map((m) => ({ key: m.key, revenue: m.revenue, expenses: m.expenses })), sel, { mini: true })}
            <p class="card-note">Säule antippen zeigt die Werte, nochmal antippen öffnet den Monat.</p>
          </div>
          ${rolling ? '' : `<div class="card list">${detailRows(t)}</div>`}
        </section>

        <section class="month-block">
          <div class="month-head"><h2>Monate</h2></div>
          <div class="card table-card">
            <div class="mt-row mt-head"><span>Monat</span><span>Umsatz</span><span>Ausgaben</span><span>Gewinn</span></div>
            ${visible.slice().reverse().map((m) => `
              <button type="button" class="mt-row" data-month="${m.key}">
                <span>${esc(monthLabel(m.key, { year: rolling, short: rolling }))}</span>
                <span>${money(m.revenue)}</span>
                <span>${money(m.expenses)}</span>
                <span class="${m.profit < 0 ? 'neg' : ''}">${money(m.profit)}</span>
              </button>`).join('') || '<p class="card-note pad">Keine Daten.</p>'}
            <div class="mt-row mt-foot"><span>Summe</span><span>${money(head.revenue)}</span><span>${money(head.expenses)}</span><span class="${head.profit < 0 ? 'neg' : ''}">${money(head.profit)}</span></div>
          </div>
          ${head.fees ? `<p class="hint">Gewinn = Umsatz − ${FEE_NAME} (${money(head.fees)}) − Ausgaben.</p>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><h2>Umsatz nach Verkaufsweg</h2><span class="muted">${esc(year)}</span></div>
          ${channelBars(t.byChannel, t.revenue)}
        </section>

        <section class="card">
          <div class="card-head"><h2>Ausgaben nach Kategorie</h2><span class="muted">${esc(year)}</span></div>
          ${expenseBars(t.byExpense)}
        </section>

        <section class="card">
          <div class="card-head"><h2>Meistverkauft</h2><span class="muted">${esc(year)}</span></div>
          ${topList(top)}
        </section>

        <section class="sec">
          <div class="sec-head"><h2>Seit Beginn</h2></div>
          <div class="card">${sumTiles(all)}</div>
          <div class="card list">${detailRows(all, { withDeposits: true })}</div>
        </section>
      </div>`;
  }
  bindChart(el, (key) => go('monat/' + key));
  el.onclick = (e) => {
    const y = e.target.closest('[data-year]');
    if (y && y.dataset.year) { year = y.dataset.year; render(); window.scrollTo(0, 0); return; }
    const r = e.target.closest('[data-seg="range"] [data-value]');
    if (r) { range = r.dataset.value; render(); return; }
    const mo = e.target.closest('[data-month]:not(.ccol)');
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
    const first = monthKeys()[0] || key;
    const prev = addMonths(key, -1), next = addMonths(key, 1);
    el.innerHTML = `
      ${navBar(monthLabel(key), 'Statistik')}
      <header class="lt compact">
        <div><h1>${esc(monthLabel(key, { year: false }))}</h1><p class="lt-sub">${esc(key.slice(0, 4))}</p></div>
        <div class="year-switch">
          <button type="button" class="icon-btn" data-to="${prev}" ${prev >= first ? '' : 'disabled'} aria-label="Vormonat">${icon('chevL')}</button>
          <button type="button" class="icon-btn" data-to="${next}" ${next <= currentMonthKey() ? '' : 'disabled'} aria-label="Folgemonat">${icon('chevR')}</button>
        </div>
      </header>
      <div class="content">
        <section class="card">${sumTiles(m)}</section>
        <div class="card list">${detailRows(m)}</div>
        ${m.revenue ? `<section class="card"><div class="card-head"><h2>Verkaufsweg</h2></div>${channelBars(m.byChannel, m.revenue)}</section>` : ''}
        ${top.length ? `<section class="card"><div class="card-head"><h2>Meistverkauft</h2></div>${topList(top)}</section>` : ''}
        <section class="month-block">
          <div class="month-head"><h2>Einträge</h2><span>${list.length}</span></div>
          ${list.length ? `<div class="card list">${list.map((e) => entryRow(e)).join('')}</div>` : '<p class="hint">Keine Einträge in diesem Monat.</p>'}
        </section>
      </div>`;
  }
  el.onclick = (e) => {
    const to = e.target.closest('[data-to]');
    if (to && !to.disabled) { go('monat/' + to.dataset.to, { replace: true }); return; }
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
    if (e.target.closest('[data-action="back"]')) back('statistik/' + key.slice(0, 4));
  };
  return { render };
}
