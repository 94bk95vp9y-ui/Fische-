import { store, commit, getBalance, getMonth, getTotals, sortedEntries, productRanking, getProduct, activeEvent } from '../store.js';
import { money, esc, currentMonthKey, addMonths, monthKey, monthLabel, fmtDateLong, todayISO, isIOS, isStandalone, pct, daysBetween, isoDate } from '../util.js';
import { icon } from '../icons.js';
import { entryRow, monthChart, bindChart, thumb, statTile } from '../components.js';
import { openEntryForm, openEntryDetail, openEventForm, openAdjust, markPaid } from '../sheets.js';
import { openSheet } from '../ui.js';
import { openProductEditor, openAiImport } from '../products.js';
import { exportBackup, backupAgeDays } from '../backup.js';
import { go } from '../nav.js';
import { showInstallHelp } from './mehr.js';

export function homeView(el) {
  function render() {
    const s = store.state;
    const mk = currentMonthKey();
    const m = getMonth(mk);
    const pm = getMonth(addMonths(mk, -1));
    const totals = getTotals();
    const bal = getBalance();
    const open = sortedEntries(s.entries.filter((e) => e.status === 'open'));
    const recent = sortedEntries(s.entries.filter((e) => e.status !== 'open')).slice(0, 5);
    const top = productRanking((e) => monthKey(e.date) === mk).slice(0, 3);
    const chartData = Array.from({ length: 6 }, (_, i) => {
      const key = addMonths(mk, i - 5);
      const x = getMonth(key);
      return { key, revenue: x.revenue, expenses: x.expenses };
    });
    const isNew = !s.products.length && !s.entries.length;
    const ev = activeEvent();

    const banners = [];
    if (store.saveError) banners.push(`<div class="banner warn">${icon('alert')}<span>${esc(store.saveError)}</span></div>`);
    if (isIOS() && !isStandalone() && !s.settings.installHintHidden) {
      banners.push(`<div class="banner">${icon('phone')}<span><strong>Als App installieren:</strong> In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“. Danach nur noch das Icon nutzen – Safari und die Home-App speichern getrennt.</span>
        <button type="button" class="banner-x" data-action="hide-install" aria-label="Ausblenden">${icon('x')}</button>
        <button type="button" class="banner-link" data-action="install-help">Anleitung</button></div>`);
    }
    const age = backupAgeDays();
    const daysUsed = daysBetween(isoDate(new Date(s.settings.createdAt || Date.now())), todayISO());
    if (s.entries.length >= 5 && ((age === null && daysUsed >= 7) || (age !== null && age >= 30))) {
      banners.push(`<div class="banner warn">${icon('alert')}<span><strong>${age === null ? 'Noch kein Backup.' : `Letztes Backup vor ${age} Tagen.`}</strong> Deine Daten liegen nur auf diesem Gerät.</span>
        <button type="button" class="banner-link" data-action="backup">Jetzt sichern</button></div>`);
    }
    if (ev) {
      banners.push(`<div class="banner accent">${icon('stall')}<span><strong>Messe-Modus:</strong> ${esc(ev.name)}</span>
        <button type="button" class="banner-link" data-go="messe/${esc(ev.id)}">Öffnen</button></div>`);
    }

    const delta = pm.revenue > 0 ? pct(m.revenue - pm.revenue, pm.revenue) : null;

    el.innerHTML = `
      <header class="lt">
        <div><h1>Übersicht</h1><p class="lt-sub">${esc(fmtDateLong(todayISO()))}</p></div>
      </header>
      <div class="content">
        ${banners.join('')}
        ${isNew && !s.settings.welcomeHidden ? `
        <section class="card welcome">
          <h2>Los geht’s</h2>
          <ol>
            <li><strong>Artikel anlegen</strong> – von Hand oder direkt aus deiner Kleinanzeigen-Anzeige.</li>
            <li><strong>Startbetrag</strong> eintragen, falls schon Geld in der Kasse ist (optional).</li>
            <li>In der <strong>Kasse</strong> antippen, was der Kunde mitnimmt – fertig.</li>
          </ol>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="new-product">${icon('plus')}Artikel anlegen</button>
            <button type="button" class="btn" data-action="ai-import">Aus Anzeige</button>
          </div>
          <button type="button" class="link small" data-action="start-balance">Startbetrag eintragen</button>
        </section>` : ''}

        <section class="card hero">
          <button type="button" class="hero-top" data-action="balance-info">
            <span class="label">Kassenstand</span>${icon('info', 'ic-sm')}
          </button>
          <div class="hero-value ${bal < 0 ? 'neg' : ''}">${money(bal)}</div>
          <div class="hero-sub">Gewinn gesamt ${money(totals.profit)} · Umsatz gesamt ${money(totals.revenue)}</div>
          <div class="quick">
            <button type="button" data-action="q-sale">${icon('inArrow')}<span>Betrag</span></button>
            <button type="button" data-action="q-expense">${icon('outArrow')}<span>Ausgabe</span></button>
            <button type="button" data-action="q-withdrawal">${icon('person')}<span>Entnahme</span></button>
            <button type="button" data-action="q-messe">${icon('stall')}<span>Messe</span></button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>${esc(monthLabel(mk, { year: false }))}</h2><button type="button" class="link" data-go="statistik">Alle Monate ${icon('chevR', 'ic-sm')}</button></div>
          <div class="stats3">
            ${statTile('Umsatz', money(m.revenue))}
            ${statTile('Ausgaben', money(m.expenses))}
            ${statTile('Gewinn', money(m.profit), m.profit < 0 ? 'neg' : '')}
          </div>
          <p class="card-note">${m.sales} ${m.sales === 1 ? 'Verkauf' : 'Verkäufe'}${m.items ? ` · ${m.items} Tiere/Artikel` : ''}${delta !== null ? ` · Umsatz ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} % ggü. ${esc(monthLabel(addMonths(mk, -1), { year: false }))}` : ''}</p>
          ${monthChart(chartData, mk)}
        </section>

        ${open.length ? `
        <section class="card">
          <div class="card-head"><h2>Offen / reserviert</h2><span class="muted">${money(open.reduce((a, e) => a + e.amount, 0))}</span></div>
          <div class="list">
            ${open.map((e) => `<div class="open-row">${entryRow(e)}<button type="button" class="btn sm" data-paid="${esc(e.id)}">${icon('check')}Bezahlt</button></div>`).join('')}
          </div>
        </section>` : ''}

        ${top.length ? `
        <section class="card">
          <div class="card-head"><h2>Bestseller im ${esc(monthLabel(mk, { year: false }))}</h2></div>
          <div class="list">
            ${top.map((r, i) => {
              const p = r.pid ? getProduct(r.pid) : null;
              return `<div class="row static">${thumb(p || { category: 'sonstiges' }, 'sm')}<span class="rmain"><span class="rtitle">${i + 1}. ${esc(r.name)}</span><span class="rsub">${r.qty} Stück verkauft</span></span><span class="ramt">${money(r.revenue)}</span></div>`;
            }).join('')}
          </div>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2>Letzte Einträge</h2>${recent.length ? `<button type="button" class="link" data-go="verlauf">Alle ${icon('chevR', 'ic-sm')}</button>` : ''}</div>
          ${recent.length ? `<div class="list">${recent.map((e) => entryRow(e)).join('')}</div>` : '<p class="card-note">Noch nichts eingetragen.</p>'}
        </section>

        ${totals.sales ? `
        <section class="card">
          <div class="card-head"><h2>Seit Beginn</h2></div>
          <div class="stats3">
            ${statTile('Umsatz', money(totals.revenue))}
            ${statTile('Ausgaben', money(totals.expenses))}
            ${statTile('Gewinn', money(totals.profit), totals.profit < 0 ? 'neg' : '')}
            ${statTile('Privat entnommen', money(totals.withdrawals))}
            ${statTile('Verkäufe', String(totals.sales))}
            ${statTile('Ø pro Verkauf', money(Math.round(totals.revenue / totals.sales)))}
          </div>
        </section>` : ''}
      </div>`;
  }

  bindChart(el, (key) => go('monat/' + key));
  el.onclick = (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    const paid = e.target.closest('[data-paid]');
    if (paid) { markPaid(paid.dataset.paid); return; }
    const row = e.target.closest('[data-entry]');
    if (row) { openEntryDetail(row.dataset.entry); return; }
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
        ${row('Umsatz (alle Verkäufe)', money(t.revenue, { sign: true }))}
        ${row('Ausgaben', money(-t.expenses))}
        ${row('Privatentnahmen', money(-t.withdrawals))}
        ${row('Einlagen', money(t.deposits, { sign: true }))}
        ${t.adjust ? row('Korrekturen (Abgleich)', money(t.adjust, { sign: true })) : ''}
        ${row('<strong>Kassenstand</strong>', `<strong>${money(bal)}</strong>`, 'total')}
      </div>
      <div class="group">
        ${row('Gewinn = Umsatz − Ausgaben', money(t.profit))}
      </div>
      <p class="hint">Der <strong>Kassenstand</strong> ist das Geld aus dem Verkauf, das gerade da sein sollte – egal ob bar oder auf dem Konto. <strong>Entnahmen</strong> und <strong>Einlagen</strong> verändern nur den Kassenstand, nicht den Gewinn. Reservierte, noch nicht bezahlte Verkäufe zählen noch nicht mit.</p>
      <button type="button" class="btn block" data-act="adjust">${icon('scale')}Mit echtem Geld abgleichen</button>`,
  });
  sheet.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="adjust"]')) { sheet.close(); openAdjust(); }
  });
}
