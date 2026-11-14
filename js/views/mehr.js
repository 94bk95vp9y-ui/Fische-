import { store, commit, replaceState, emptyState, activeEvent, activeProducts } from '../store.js';
import { esc, fmtDateTime, isStandalone } from '../util.js';
import { icon } from '../icons.js';
import { CHANNELS, CHANNEL_KEYS, FEE_NAME } from '../model.js';
import { seg } from '../components.js';
import { openAdjust, openEntryForm } from '../sheets.js';
import { openSheet, actionSheet, undoToast, openAmountPad, copyText, toast } from '../ui.js';
import { exportBackup, importBackup, exportCsv, backupAgeDays } from '../backup.js';
import { go } from '../nav.js';

export const APP_VERSION = '2.1.0';

const THEMES = [{ value: 'auto', label: 'Automatisch' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }];

const item = (action, ic, label, value = '', cls = '', tone = 'c-brand') =>
  `<button type="button" class="row nav-row ${cls}" data-action="${action}">
    <span class="ricon ${tone}">${icon(ic)}</span><span class="rmain"><span class="rtitle">${esc(label)}</span></span>
    ${value ? `<span class="row-value">${value}</span>` : ''}${icon('chevR', 'chev')}</button>`;

export function mehrView(el) {
  function render() {
    const s = store.state;
    const age = backupAgeDays();
    const ev = activeEvent();
    const nProd = s.products.filter((p) => p.active).length;
    el.innerHTML = `
      <header class="lt"><div><h1>Mehr</h1></div></header>
      <div class="content">
        <div class="features">
          <button type="button" class="feature" data-action="artikel">
            <span class="ricon c-brand">${icon('fish')}</span>
            <strong>Artikel & Preise</strong>
            <span>${nProd ? `${nProd} in der Kasse` : 'Noch keine angelegt'}</span>
          </button>
          <button type="button" class="feature" data-action="messen">
            <span class="ricon c-accent">${icon('stall')}</span>
            <strong>Messen & Börsen</strong>
            <span>${ev ? `<em class="pill accent">Messe-Modus aktiv</em>` : s.events.length ? `${s.events.length} angelegt` : 'Noch keine angelegt'}</span>
          </button>
        </div>
        <section class="month-block"><div class="month-head"><h2>Kasse</h2></div>
          <div class="card list">
            ${item('fee', 'tag', `${FEE_NAME} auf Verkäufe`, s.settings.feeRate > 0 ? `${s.settings.feeRate} %` : 'aus', '', 'c-accent')}
            ${item('adjust', 'scale', 'Mit echtem Geld abgleichen')}
            ${item('deposit', 'arrowDown', 'Einlage / Startbetrag', '', '', 'c-pos')}
            ${item('withdrawal', 'person', 'Privatentnahme', '', '', 'c-sand')}
            <label class="row nav-row select-row"><span class="ricon c-brand">${icon('tag')}</span><span class="rmain"><span class="rtitle">Verkaufsweg</span></span>
              <select class="in inline" data-setting="defaultChannel">${CHANNEL_KEYS.map((k) => `<option value="${k}" ${s.settings.defaultChannel === k ? 'selected' : ''}>${esc(CHANNELS[k].short)}</option>`).join('')}</select></label>
          </div>
        </section>
        <section class="month-block"><div class="month-head"><h2>Datensicherung</h2></div>
          <div class="card list">
            ${item('backup', 'share', 'Backup erstellen', age === null ? '<span class="neg">noch nie</span>' : age === 0 ? 'heute' : `vor ${age} ${age === 1 ? 'Tag' : 'Tagen'}`)}
            ${item('restore', 'import', 'Backup laden')}
            ${item('csv', 'file', 'Als Tabelle exportieren (CSV)')}
            ${item('copy-ads', 'copy', 'Anzeigen als Text kopieren')}
          </div>
          <p class="hint">Alle Daten liegen nur auf diesem Gerät – es gibt keine Cloud. Speichere regelmäßig ein Backup in der Dateien-App oder iCloud Drive. Das Backup enthält auch die Fotos.</p>
        </section>
        <section class="month-block"><div class="month-head"><h2>Darstellung</h2></div>
          ${seg('theme', THEMES, s.settings.theme || 'auto')}
        </section>
        <section class="month-block"><div class="month-head"><h2>Hilfe</h2></div>
          <div class="card list">
            ${item('calc', 'info', 'So wird gerechnet')}
            ${item('install', 'phone', 'Auf dem iPhone installieren', isStandalone() ? 'installiert' : '')}
          </div>
        </section>
        <section class="month-block">
          <div class="card list">${item('reset', 'trash', 'Alle Daten löschen', '', 'danger', 'c-neg')}</div>
          <p class="hint center">Fischkasse ${APP_VERSION}${s.savedAt ? ` · zuletzt gespeichert ${esc(fmtDateTime(s.savedAt))}` : ''}</p>
        </section>
      </div>`;
  }
  el.onchange = (e) => {
    const sel = e.target.closest('[data-setting]');
    if (sel) commit((s) => { s.settings[sel.dataset.setting] = sel.value; });
  };
  el.onclick = async (e) => {
    const th = e.target.closest('[data-seg="theme"] [data-value]');
    if (th) { commit((s) => { s.settings.theme = th.dataset.value; }); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'artikel': go('artikel'); break;
      case 'messen': go('messen'); break;
      case 'adjust': openAdjust(); break;
      case 'fee':
        openAmountPad({
          title: `${FEE_NAME} auf Verkäufe`, label: 'Prozent von jedem neuen Verkauf', integer: true, unit: '%', initial: store.state.settings.feeRate || null, allowEmpty: true,
          hint: (n) => (n > 100 ? 'Höchstens 100 %' : n ? `Beispiel: 20,00 € Verkauf → ${(20 * n / 100).toFixed(2).replace('.', ',')} € ${FEE_NAME}` : `Leer = keine ${FEE_NAME}`),
          onSet: (n) => { commit((st) => { st.settings.feeRate = Math.min(100, n || 0); }); },
        });
        break;
      case 'copy-ads': copyAds(); break;
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

/** Titel + Beschreibung aller Artikel in der Kasse als Text in die Zwischenablage (z. B. für eine KI). */
async function copyAds() {
  const list = activeProducts();
  if (!list.length) { toast('Noch keine Artikel in der Kasse'); return; }
  const text = list.map((p, i) => `Anzeige ${i + 1}\nTitel: ${p.name}\nBeschreibung: ${(p.note || '').trim() || '(keine)'}`).join('\n\n');
  const ok = await copyText(text);
  toast(ok ? `${list.length} ${list.length === 1 ? 'Anzeige' : 'Anzeigen'} kopiert` : 'Kopieren nicht möglich');
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
        <div><strong>${FEE_NAME}</strong><span>Fester Prozentsatz (einstellbar, Standard 10 %), der von jedem neuen Verkauf abgeht. Beispiel: 20 € Verkauf, 10 % → 2 € ${FEE_NAME}, 18 € bleiben. Der Satz lässt sich beim Kassieren pro Verkauf ändern. Frühere Verkäufe behalten ihren Satz.</span></div>
        <div><strong>Gewinn</strong><span>Umsatz − ${FEE_NAME} − Ausgaben.</span></div>
        <div><strong>Privatentnahme</strong><span>Geld, das du dir selbst auszahlst. Senkt den Kassenstand, aber nicht den Gewinn.</span></div>
        <div><strong>Einlage</strong><span>Eigenes Geld, das du in die Kasse legst (z. B. Startbetrag). Erhöht den Kassenstand, ist aber kein Umsatz.</span></div>
        <div><strong>Kassenstand</strong><span>Einlagen + Umsatz − Ausgaben − Entnahmen ± Abgleich. So viel Geld sollte gerade da sein. Die ${FEE_NAME} mindert nur den Gewinn – das Geld liegt in der Kasse, bis du es entnimmst.</span></div>
        <div><strong>Offen / reserviert</strong><span>Zählt erst, wenn du „bezahlt“ antippst – mit dem Datum der Bezahlung.</span></div>
        <div><strong>Rabatt</strong><span>Zahlt ein Kunde weniger als die Summe, zählt der tatsächlich bezahlte Betrag. In der Artikel-Statistik wird der Rabatt anteilig verteilt.</span></div>
      </div>
      <p class="hint">Hinweis: Die App ist eine Übersicht für dich, kein steuerliches Kassenbuch. Ob und wie du Verkäufe versteuern musst, kläre bei Bedarf mit dem Finanzamt oder einer Steuerberatung. Der CSV-Export hilft dabei.</p>`,
  });
}

