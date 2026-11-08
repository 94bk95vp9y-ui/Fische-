import { store, commit, replaceState, emptyState, activeEvent } from '../store.js';
import { esc, fmtDateTime, isStandalone } from '../util.js';
import { icon } from '../icons.js';
import { CHANNELS, CHANNEL_KEYS } from '../model.js';
import { openAdjust, openEntryForm } from '../sheets.js';
import { openSheet, actionSheet, undoToast } from '../ui.js';
import { exportBackup, importBackup, exportCsv, backupAgeDays } from '../backup.js';
import { go } from '../nav.js';

export const APP_VERSION = '1.0.0';

const item = (action, ic, label, value = '', cls = '') =>
  `<button type="button" class="row nav-row ${cls}" data-action="${action}">
    <span class="ricon plain">${icon(ic)}</span><span class="rmain"><span class="rtitle">${esc(label)}</span></span>
    ${value ? `<span class="row-value">${value}</span>` : ''}${icon('chevR', 'chev')}</button>`;

export function mehrView(el) {
  function render() {
    const s = store.state;
    const age = backupAgeDays();
    const ev = activeEvent();
    el.innerHTML = `
      <header class="lt"><div><h1>Mehr</h1></div></header>
      <div class="content">
        <section class="month-block"><div class="month-head"><h2>Auswertung</h2></div>
          <div class="card list">
            ${item('stats', 'chart', 'Statistik nach Monaten')}
            ${item('messen', 'stall', 'Messen & Börsen', ev ? '<em class="pill accent">aktiv</em>' : String(s.events.length || ''))}
          </div>
        </section>
        <section class="month-block"><div class="month-head"><h2>Kasse</h2></div>
          <div class="card list">
            ${item('adjust', 'scale', 'Mit echtem Geld abgleichen')}
            ${item('deposit', 'plusCircle', 'Einlage / Startbetrag')}
            ${item('withdrawal', 'person', 'Privatentnahme')}
            <label class="row nav-row select-row"><span class="ricon plain">${icon('tag')}</span><span class="rmain"><span class="rtitle">Standard-Verkaufsweg</span></span>
              <select class="in inline" data-setting="defaultChannel">${CHANNEL_KEYS.map((k) => `<option value="${k}" ${s.settings.defaultChannel === k ? 'selected' : ''}>${esc(CHANNELS[k].short)}</option>`).join('')}</select></label>
          </div>
        </section>
        <section class="month-block"><div class="month-head"><h2>Datensicherung</h2></div>
          <div class="card list">
            ${item('backup', 'share', 'Backup erstellen', age === null ? '<span class="neg">noch nie</span>' : age === 0 ? 'heute' : `vor ${age} ${age === 1 ? 'Tag' : 'Tagen'}`)}
            ${item('restore', 'import', 'Backup laden')}
            ${item('csv', 'file', 'Als Tabelle exportieren (CSV)')}
          </div>
          <p class="card-note">Alle Daten liegen nur auf diesem Gerät – es gibt keine Cloud. Speichere regelmäßig ein Backup in der Dateien-App oder iCloud Drive. Das Backup enthält auch die Fotos.</p>
        </section>
        <section class="month-block"><div class="month-head"><h2>Hilfe</h2></div>
          <div class="card list">
            ${item('calc', 'info', 'So wird gerechnet')}
            ${item('install', 'phone', 'Auf dem iPhone installieren', isStandalone() ? 'installiert' : '')}
          </div>
        </section>
        <section class="month-block">
          <div class="card list">${item('reset', 'trash', 'Alle Daten löschen', '', 'danger')}</div>
          <p class="card-note center">Fischkasse ${APP_VERSION}${s.savedAt ? ` · zuletzt gespeichert ${esc(fmtDateTime(s.savedAt))}` : ''}</p>
        </section>
      </div>`;
  }
  el.onchange = (e) => {
    const sel = e.target.closest('[data-setting]');
    if (sel) commit((s) => { s.settings[sel.dataset.setting] = sel.value; });
  };
  el.onclick = async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'stats': go('statistik'); break;
      case 'messen': go('messen'); break;
      case 'adjust': openAdjust(); break;
      case 'deposit': openEntryForm({ type: 'deposit' }); break;
      case 'withdrawal': openEntryForm({ type: 'withdrawal' }); break;
      case 'backup': exportBackup(); break;
      case 'restore': importBackup(); break;
      case 'csv': exportCsv(); break;
      case 'calc': showHowCalc(); break;
      case 'install': showInstallHelp(); break;
      case 'reset': {
        const r = await actionSheet({
          title: 'Wirklich alles löschen?',
          message: 'Artikel, Fotos, Verkäufe, Ausgaben und Messen werden von diesem Gerät entfernt. Mach vorher am besten ein Backup.',
          actions: [{ label: 'Alles löschen', value: 'yes', style: 'destructive' }],
        });
        if (r !== 'yes') return;
        const undo = replaceState(emptyState());
        undoToast('Alle Daten gelöscht', undo);
        break;
      }
    }
  };
  return { render };
}

export function showInstallHelp() {
  openSheet({
    title: 'Als App installieren',
    left: 'Fertig',
    onLeft: (s) => s.close(),
    content: `
      <ol class="steps plain">
        <li><strong>In Safari öffnen</strong><span>Die Adresse dieser Seite (dein GitHub-Pages-Link) in Safari aufrufen – nicht in Chrome oder in der Kleinanzeigen-App.</span></li>
        <li><strong>Teilen antippen</strong><span>Das Quadrat mit dem Pfeil nach oben ${icon('share', 'ic-inline')} unten in der Leiste (bei neueren iOS-Versionen ggf. erst auf „…“).</span></li>
        <li><strong>„Zum Home-Bildschirm“</strong><span>Etwas nach unten scrollen, antippen, dann „Hinzufügen“. Falls gefragt: „Als Web-App öffnen“ aktiviert lassen.</span></li>
        <li><strong>Ab jetzt nur das Icon nutzen</strong><span>Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari. Was du in Safari einträgst, siehst du in der App nicht – und umgekehrt.</span></li>
      </ol>
      <div class="banner warn">${icon('alert')}<span><strong>Wichtig:</strong> Wenn du das Icon vom Home-Bildschirm löschst, löscht iOS auch die gespeicherten Daten. Vorher immer ein Backup machen.</span></div>
      <p class="hint">Die App funktioniert nach dem ersten Öffnen auch ohne Internet.</p>`,
  });
}

export function showHowCalc() {
  openSheet({
    title: 'So wird gerechnet',
    left: 'Fertig',
    onLeft: (s) => s.close(),
    content: `
      <div class="group explain">
        <div><strong>Umsatz</strong><span>Alles, was Kunden bezahlt haben (Kasse, Schnell-Betrag, Messe-Einnahmen).</span></div>
        <div><strong>Ausgaben</strong><span>Was du fürs Hobby/Geschäft kaufst: Technik, neue Tiere, Futter, Versand, Standgebühr …</span></div>
        <div><strong>Gewinn</strong><span>Umsatz − Ausgaben.</span></div>
        <div><strong>Privatentnahme</strong><span>Geld, das du dir selbst auszahlst. Senkt den Kassenstand, aber nicht den Gewinn.</span></div>
        <div><strong>Einlage</strong><span>Eigenes Geld, das du in die Kasse legst (z. B. Startbetrag). Erhöht den Kassenstand, ist aber kein Umsatz.</span></div>
        <div><strong>Kassenstand</strong><span>Einlagen + Umsatz − Ausgaben − Entnahmen ± Abgleich. So viel Geld sollte gerade da sein.</span></div>
        <div><strong>Offen / reserviert</strong><span>Zählt erst, wenn du „bezahlt“ antippst – mit dem Datum der Bezahlung.</span></div>
        <div><strong>Rabatt</strong><span>Zahlt ein Kunde weniger als die Summe, zählt der tatsächlich bezahlte Betrag. In der Artikel-Statistik wird der Rabatt anteilig verteilt.</span></div>
      </div>
      <p class="hint">Hinweis: Die App ist eine Übersicht für dich, kein steuerliches Kassenbuch. Ob und wie du Verkäufe versteuern musst, kläre bei Bedarf mit dem Finanzamt oder einer Steuerberatung. Der CSV-Export hilft dabei.</p>`,
  });
}

