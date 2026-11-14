import { store, commit, getBalance, getMonth, getTotals, sortedEntries, activeEvent } from '../store.js';
import { money, esc, currentMonthKey, addMonths, monthLabel, fmtDateLong, todayISO, isIOS, isStandalone, pct, daysBetween, isoDate } from '../util.js';
import { icon, FISH_SVG } from '../icons.js';
import { entryRow, statTile, moneyParts } from '../components.js';
import { openEntryForm, openEntryDetail, openEventForm, openAdjust, markPaid } from '../sheets.js';
import { openSheet } from '../ui.js';
import { openProductEditor, openAiImport } from '../products.js';
import { exportBackup, backupAgeDays } from '../backup.js';
import { go } from '../nav.js';
import { FEE_NAME } from '../model.js';
import { showInstallHelp } from './mehr.js';

// Feste „Schwimmbahnen“: Höhe, Größe, Dauer, Startversatz, Richtung.
const LANES = [
  { y: 34, s: 1, d: 26, delay: -4, rev: false },
  { y: 62, s: .7, d: 34, delay: -19, rev: true },
  { y: 46, s: .85, d: 30, delay: -13, rev: false },
  { y: 76, s: 1.15, d: 38, delay: -27, rev: true },
  { y: 28, s: .6, d: 22, delay: -9, rev: true },
  { y: 68, s: .9, d: 28, delay: -2, rev: false },
  { y: 54, s: .65, d: 36, delay: -31, rev: false },
];
const BUBBLES = [
  { x: 12, w: 7, d: 7, delay: -1 }, { x: 31, w: 5, d: 9, delay: -5 }, { x: 68, w: 8, d: 8, delay: -3 }, { x: 86, w: 5, d: 10, delay: -7 },
];

/** Das Becken: pro heutigem Verkauf schwimmt ein Fisch (höchstens so viele, wie Bahnen da sind). */
function water(fishCount) {
  const fish = LANES.slice(0, Math.min(fishCount, LANES.length)).map((l, i) =>
    `<span class="swim ${l.rev ? 'rev' : ''}" style="--y:${l.y}%;--s:${l.s};--d:${l.d}s;--delay:${l.delay}s;--rest:${12 + i * 12}%">${FISH_SVG}</span>`).join('');
  const bubbles = BUBBLES.map((b) => `<span class="bub" style="--x:${b.x}%;--w:${b.w}px;--d:${b.d}s;--delay:${b.delay}s"></span>`).join('');
  return `<div class="tank-water" aria-hidden="true"><span class="wave w1"></span><span class="wave w2"></span>${fish}${bubbles}</div>`;
}

// Startseite: nur das Wichtigste auf einen Blick. Auswertungen stehen in der Statistik.
export function homeView(el) {
  function banners() {
    const s = store.state;
    const out = [];
    if (store.saveError) out.push(`<div class="banner warn">${icon('alert')}<span>${esc(store.saveError)}</span></div>`);
    const ev = activeEvent();
    if (ev) {
      out.push(`<div class="banner accent">${icon('stall')}<span><strong>Messe-Modus:</strong> ${esc(ev.name)}</span>
        <button type="button" class="banner-link" data-go="messe/${esc(ev.id)}">Öffnen</button></div>`);
    }
    const age = backupAgeDays();
    const daysUsed = daysBetween(isoDate(new Date(s.settings.createdAt || Date.now())), todayISO());
    if (s.entries.length >= 5 && ((age === null && daysUsed >= 7) || (age !== null && age >= 30))) {
      out.push(`<div class="banner warn">${icon('alert')}<span><strong>${age === null ? 'Noch kein Backup' : `Backup ist ${age} Tage alt`}</strong> – Daten liegen nur auf diesem Gerät.</span>
        <button type="button" class="banner-link" data-action="backup">Sichern</button></div>`);
    }
    if (isIOS() && !isStandalone() && !s.settings.installHintHidden) {
      out.push(`<div class="banner">${icon('phone')}<span><strong>Tipp:</strong> Über „Teilen → Zum Home-Bildschirm“ wird das hier eine App.</span>
        <button type="button" class="banner-link" data-action="install-help">So geht’s</button>
        <button type="button" class="banner-x" data-action="hide-install" aria-label="Ausblenden">${icon('x')}</button></div>`);
    }
    return out.join('');
  }

  function render() {
    const s = store.state;
    const mk = currentMonthKey();
    const m = getMonth(mk);
    const pm = getMonth(addMonths(mk, -1));
    const bal = getBalance();
    const today = todayISO();
    const todaySales = s.entries.filter((e) => e.type === 'sale' && e.status !== 'open' && e.date === today);
    const todaySum = todaySales.reduce((a, e) => a + e.amount, 0);
    const open = sortedEntries(s.entries.filter((e) => e.status === 'open'));
    const recent = sortedEntries(s.entries.filter((e) => e.status !== 'open')).slice(0, 5);
    const isNew = !s.products.length && !s.entries.length;
    const delta = pm.revenue > 0 ? pct(m.revenue - pm.revenue, pm.revenue) : null;
    const prevName = monthLabel(addMonths(mk, -1), { year: false });
    const balText = money(bal);

    const monthNote = [`${m.sales} ${m.sales === 1 ? 'Verkauf' : 'Verkäufe'}`];
    if (m.lumpSales) monthNote.push(`${m.lumpSales} ${m.lumpSales === 1 ? 'Messetag' : 'Messetage'}`);
    // Anteil der Ausgaben am Umsatz: der Rest des Balkens ist der Gewinn
    const spent = m.revenue > 0 ? Math.min(100, (m.expenses / m.revenue) * 100) : (m.expenses > 0 ? 100 : 0);

    el.innerHTML = `
      <header class="lt">
        <div><span class="eyebrow">${esc(fmtDateLong(today))}</span><h1>Fischkasse</h1></div>
      </header>
      <div class="content">
        ${banners()}

        ${isNew && !s.settings.welcomeHidden ? `
        <section class="card welcome">
          <h2>Willkommen</h2>
          <p>In drei Schritten startklar:</p>
          <ol>
            <li><span><strong>Artikel anlegen</strong> – von Hand oder aus deiner Anzeige.</span></li>
            <li><span>Optional: <strong>Startbetrag</strong> eintragen, falls schon Geld da ist.</span></li>
            <li><span>In der <strong>Kasse</strong> antippen, was der Kunde mitnimmt.</span></li>
          </ol>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="new-product">${icon('plus')}Artikel anlegen</button>
            <button type="button" class="btn" data-action="ai-import">Aus Anzeige</button>
          </div>
          <button type="button" class="link small" data-action="start-balance">Startbetrag eintragen ${icon('chevR', 'ic-sm')}</button>
        </section>` : ''}

        <section class="tank">
          ${water(todaySales.length)}
          <button type="button" class="tank-label" data-action="balance-info" aria-label="Kassenstand – Details anzeigen">
            <span>Kassenstand</span>${icon('info')}
          </button>
          <div class="tank-value ${bal < 0 ? 'neg' : ''} ${balText.length > 10 ? 'long' : ''}">${moneyParts(bal)}</div>
          <p class="tank-today">${todaySales.length
            ? `Heute <strong>${money(todaySum, { sign: true })}</strong> · ${todaySales.length} ${todaySales.length === 1 ? 'Verkauf' : 'Verkäufe'}`
            : 'Heute noch kein Verkauf'}</p>
          <div class="quick">
            <button type="button" data-action="q-sale">${icon('arrowDown')}<span>Einnahme</span></button>
            <button type="button" data-action="q-expense">${icon('arrowUp')}<span>Ausgabe</span></button>
            <button type="button" data-action="q-withdrawal">${icon('person')}<span>Entnahme</span></button>
            <button type="button" data-action="q-messe">${icon('stall')}<span>Messe</span></button>
          </div>
        </section>

        ${open.length ? `
        <section class="sec">
          <div class="sec-head"><h2>Reserviert</h2><span class="muted num">${money(open.reduce((a, e) => a + e.amount, 0))} offen</span></div>
          <div class="card list">
            ${open.map((e) => `<div class="open-row">${entryRow(e, { hideAmount: true })}<span class="open-side"><span class="ramt">${money(e.amount)}</span><button type="button" class="btn sm" data-paid="${esc(e.id)}">${icon('check')}Bezahlt</button></span></div>`).join('')}
          </div>
        </section>` : ''}

        <section class="sec">
          <div class="sec-head"><h2>Zuletzt</h2>${recent.length ? `<button type="button" class="link" data-go="verlauf">Alle ${icon('chevR', 'ic-sm')}</button>` : ''}</div>
          ${recent.length ? `<div class="card list">${recent.map((e) => entryRow(e)).join('')}</div>` : '<div class="card"><p class="card-note flush">Noch nichts eingetragen. Verkäufe zählst du über den roten Knopf unten.</p></div>'}
        </section>
      </div>`;
  }

  el.onclick = (e) => {
    const paid = e.target.closest('[data-paid]');
    if (paid) { markPaid(paid.dataset.paid); return; }
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'q-sale': openEntryForm({ type: 'sale' }); break;
      case 'q-expense': openEntryForm({ type: 'expense' }); break;
      case 'q-withdrawal': openEntryForm({ type: 'withdrawal' }); break;
      case 'q-messe': openEventForm(); break;
      case 'start-balance': openEntryForm({ type: 'deposit', preset: { note: 'Startbetrag' } }); break;
      case 'new-product': openProductEditor(null); break;
      case 'ai-import': openAiImport(); break;
      case 'balance-info': openBalanceInfo(); break;
      case 'hide-install': commit((s) => { s.settings.installHintHidden = true; }); break;
      case 'install-help': showInstallHelp(); break;
      case 'backup': exportBackup(); break;
    }
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[role="link"][data-go]')) go(e.target.dataset.go);
  };
  return { render };
}

function openBalanceInfo() {
  const t = getTotals();
  const bal = getBalance();
  const row = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const sheet = openSheet({
    title: 'Kassenstand',
    left: 'Schließen',
    onLeft: (s) => s.close(),
    content: `
      <div class="group">
        ${row('Umsatz', money(t.revenue, { sign: true }))}
        ${row('Ausgaben', money(-t.expenses))}
        ${row('Privatentnahmen', money(-t.withdrawals))}
        ${row('Einlagen', money(t.deposits, { sign: true }))}
        ${t.adjust ? row('Korrekturen (Abgleich)', money(t.adjust, { sign: true })) : ''}
        ${row('Kassenstand', money(bal), 'total')}
      </div>
      <div class="group">
        ${t.fees ? row(`${FEE_NAME}`, money(-t.fees)) : ''}
        ${row(t.fees ? `Gewinn (Umsatz − ${FEE_NAME} − Ausgaben)` : 'Gewinn (Umsatz − Ausgaben)', money(t.profit))}
      </div>
      <p class="hint">Der <strong>Kassenstand</strong> ist das Geld aus dem Verkauf, das gerade da sein sollte – bar und auf dem Konto zusammen. <strong>Entnahmen</strong> und <strong>Einlagen</strong> verändern nur den Kassenstand, nicht den Gewinn. Reservierte Verkäufe zählen erst, wenn sie bezahlt sind.</p>
      <button type="button" class="btn block" data-act="adjust">${icon('scale')}Mit echtem Geld abgleichen</button>`,
  });
  sheet.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="adjust"]')) { sheet.close(); openAdjust(); }
  });
}
