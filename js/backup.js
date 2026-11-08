// Datensicherung: Backup (JSON, inkl. Fotos), Wiederherstellen, CSV-Export.
import { store, commit, replaceState, sortedEntries, getEvent } from './store.js';
import { shareFile, pickFile, actionSheet, toast, undoToast } from './ui.js';
import { todayISO, daysBetween, isoDate, fmtDateTime, fmtDateNumeric } from './util.js';
import { CHANNELS, EXPENSE_CATS, ENTRY_TYPES, balanceEffect } from './model.js';

export function backupAgeDays() {
  const lb = store.state.settings.lastBackup;
  if (!lb) return null;
  return daysBetween(isoDate(new Date(lb)), todayISO());
}

// Wichtig: kein await vor dem Teilen – iOS erlaubt das Teilen-Menü nur direkt nach einem Tippen.
export async function exportBackup() {
  const payload = { app: 'fischkasse', kind: 'backup', schema: store.state.schema, exportedAt: new Date().toISOString(), data: store.state };
  const json = JSON.stringify(payload);
  const name = `fischkasse-backup-${todayISO()}.json`;
  const r = await shareFile(name, 'application/json', json);
  if (r === 'cancelled') return;
  commit((s) => { s.settings.lastBackup = Date.now(); });
  toast(r === 'shared' ? 'Backup erstellt – am besten „In Dateien sichern“ wählen' : 'Backup heruntergeladen');
}

export async function importBackup() {
  const file = await pickFile('.json,application/json,text/plain');
  if (!file) return;
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { toast('Die Datei ist kein gültiges Backup'); return; }
  const data = payload && payload.app === 'fischkasse' && payload.data ? payload.data : null;
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.products)) { toast('Das ist kein Fischkasse-Backup'); return; }
  const when = payload.exportedAt ? fmtDateTime(Date.parse(payload.exportedAt)) : 'unbekannt';
  const r = await actionSheet({
    title: 'Backup laden?',
    message: `Stand: ${when}\n${data.products.length} Artikel · ${data.entries.length} Einträge · ${(data.events || []).length} Messen.\nDie aktuellen Daten auf diesem Gerät werden dadurch ersetzt.`,
    actions: [{ label: 'Daten ersetzen', value: 'replace', style: 'destructive' }],
  });
  if (r !== 'replace') return;
  const undo = replaceState({ ...data, settings: { ...data.settings, lastBackup: data.settings?.lastBackup || Date.now() } });
  undoToast('Backup geladen', undo);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const deNum = (cents) => (cents / 100).toFixed(2).replace('.', ',');

export async function exportCsv() {
  const rows = [['Datum', 'Art', 'Kanal', 'Messe', 'Kategorie', 'Artikel', 'Stück', 'Betrag (EUR)', 'Wirkung Kasse (EUR)', 'Status', 'Notiz']];
  for (const e of sortedEntries().reverse()) {
    const ev = e.eventId ? getEvent(e.eventId) : null;
    rows.push([
      fmtDateNumeric(e.date),
      ENTRY_TYPES[e.type]?.label || e.type,
      e.type === 'sale' ? (CHANNELS[e.channel] || CHANNELS.other).label : '',
      ev ? ev.name : '',
      e.type === 'expense' ? EXPENSE_CATS[e.category] || '' : '',
      (e.items || []).map((i) => `${i.qty}x ${i.name} à ${deNum(i.unit)}`).join(', '),
      (e.items || []).reduce((a, i) => a + i.qty, 0) || '',
      deNum(e.amount),
      deNum(e.status === 'open' ? 0 : balanceEffect(e)),
      e.status === 'open' ? 'offen' : '',
      e.note || '',
    ]);
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const r = await shareFile(`fischkasse-${todayISO()}.csv`, 'text/csv', csv);
  if (r === 'downloaded') toast('CSV heruntergeladen');
}

