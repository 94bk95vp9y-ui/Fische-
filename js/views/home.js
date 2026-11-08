import { store, commit, getBalance, getMonth, getTotals, sortedEntries, activeEvent } from '../store.js';
import { money, esc, currentMonthKey, addMonths, monthLabel, fmtDateLong, todayISO, isIOS, isStandalone, pct, daysBetween, isoDate } from '../util.js';
import { icon } from '../icons.js';
import { entryRow, statTile } from '../components.js';
import { openEntryForm, openEntryDetail, openEventForm, openAdjust, markPaid } from '../sheets.js';
import { openSheet } from '../ui.js';
import { openProductEditor, openAiImport } from '../products.js';
import { exportBackup, backupAgeDays } from '../backup.js';
import { go } from '../nav.js';
import { showInstallHelp } from './mehr.js';

// Startseite: nur das Wichtigste auf einen Blick.
// Auswertungen (Diagramm, Bestseller, Summen seit Beginn) stehen in der Statistik.
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
        <button type="button" class="banner-x" data-action="hide-install" aria-label="Ausblenden">${icon('x')}</button>
        <button type="button" class="banner-link" data-action="install-help">So geht’s</button></div>`);
    }
    return out.join('');
  }

  function render() {
    const s = store.state;
    const mk = currentMonthKey();
    const m = getMonth(mk);
    const pm = getMonth(addMonths(mk, -1));
    const bal = getBalance();
    const open = sortedEntries(s.entries.filter((e) => e.status === 'open'));
    const recent = sortedEntries(s.entries.filter((e) => e.status !== 'open')).slice(0, 5);
    const isNew = !s.products.length && !s.entries.length;
    const delta = pm.revenue > 0 ? pct(m.revenue - pm.revenue, pm.revenue) : null;
    const prevName = monthLabel(addMonths(mk, -1), { year: false });

    const monthNote = [];
    monthNote.push(`${m.sales} ${m.sales === 1 ? 'Verkauf' : 'Verkäufe'}`);
    if (m.lumpSales) monthNote.push(`${m.lumpSales} ${m.lumpSales === 1 ? 'Messetag' : 'Messetage'}`);
    if (delta !== null) monthNote.push(`Umsatz ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} % ggü. ${prevName}`);

    el.innerHTML = `
      <header class="lt">
        <div><h1>Übersicht</h1><p class="lt-sub">${esc(fmtDateLong(todayISO()))}</p></div>
      </header>
      <div class="content">
        ${banners()}

        ${isNew && !s.settings.welcomeHidden ? `
        <section class="card welcome">
          <h2>Los geht’s</h2>
          <ol>
            <li><strong>Artikel anlegen</strong> – von Hand oder aus deiner Anzeige.</li>
            <li>Optional: <strong>Startbetrag</strong> eintragen, falls schon Geld da ist.</li>
            <li>In der <strong>Kasse</strong> antippen, was der Kunde mitnimmt.</li>
          </ol>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="new-product">${icon('plus')}Artikel anlegen</button>
            <button type="button" class="btn" data-action="ai-import">Aus Anzeige</button>
          </div>
          <button type="button" class="link small" data-action="start-balance">Startbetrag eintragen</button>
        </section>` : ''}

        <section class="card hero">
          <button type="button" class="hero-top" data-action="balance-info">
            <span>Kassenstand</span>${icon('info', 'ic-sm')}
          </button>
          <div class="hero-value ${bal < 0 ? 'neg' : ''}">${money(bal)}</div>
          <div class="quick">
            <button type="button" data-action="q-sale">${icon('inArrow')}<span>Betrag</span></button>
            <button type="button" data-action="q-expense">${icon('outArrow')}<span>Ausgabe</span></button>
            <button type="button" data-action="q-withdrawal">${icon('person')}<span>Entnahme</span></button>
            <button type="button" data-action="q-messe">${icon('stall')}<span>Messe</span></button>
          </div>
        </section>

        <section class="sec">
          <div class="sec-head"><h2>${esc(monthLabel(mk, { year: false }))}</h2><button type="button" class="link" data-go="monat/${mk}">Details ${icon('chevR', 'ic-sm')}</button></div>
          <div class="card month-card" data-go="monat/${mk}" role="link" tabindex="0">
            <div class="stats3">
              ${statTile('Umsatz', money(m.revenue))}
              ${statTile('Ausgaben', money(m.expenses))}
              ${statTile('Gewinn', money(m.profit), m.profit < 0 ? 'neg' : '')}
            </div>
            <p class="card-note">${esc(monthNote.join(' · '))}</p>
          </div>
        </section>

        ${open.length ? `
        <section class="sec">
          <div class="sec-head"><h2>Offen / reserviert</h2><span class="muted">${money(open.reduce((a, e) => a + e.amount, 0))}</span></div>
          <div class="card list">
            ${open.map((e) => `<div class="open-row">${entryRow(e)}<button type="button" class="btn sm" data-paid="${esc(e.id)}">${icon('check')}Bezahlt</button></div>`).join('')}
          </div>
        </section>` : ''}

        <section class="sec">
          <div class="sec-head"><h2>Letzte Einträge</h2>${recent.length ? `<button type="button" class="link" data-go="verlauf">Alle ${icon('chevR', 'ic-sm')}</button>` : ''}</div>
          ${recent.length ? `<div class="card list">${recent.map((e) => entryRow(e)).join('')}</div>` : '<div class="card"><p class="card-note flush">Noch nichts eingetragen.</p></div>'}
        </section>

        <button type="button" class="card nav-card" data-go="statistik">
          <span class="import-ic">${icon('chart')}</span>
          <span class="rmain"><span class="rtitle">Statistik</span><span class="rsub">Monate, Jahre, Bestseller, Summen seit Beginn</span></span>
          ${icon('chevR', 'chev')}
        </button>
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
        ${row('Gewinn (Umsatz − Ausgaben)', money(t.profit))}
      </div>
      <p class="hint">Der <strong>Kassenstand</strong> ist das Geld aus dem Verkauf, das gerade da sein sollte – bar und auf dem Konto zusammen. <strong>Entnahmen</strong> und <strong>Einlagen</strong> verändern nur den Kassenstand, nicht den Gewinn. Reservierte Verkäufe zählen erst, wenn sie bezahlt sind.</p>
      <button type="button" class="btn block" data-act="adjust">${icon('scale')}Mit echtem Geld abgleichen</button>`,
  });
  sheet.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="adjust"]')) { sheet.close(); openAdjust(); }
  });
}
