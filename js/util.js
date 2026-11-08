// Kleine Helfer: Geld, Datum, Text. Alle Beträge werden intern in CENT (Integer) gerechnet,
// damit keine Rundungsfehler wie 0.1 + 0.2 entstehen.

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE');

/** 1234 -> "12,34 €". sign: true setzt ein "+" vor positive Werte. */
export function money(cents, { sign = false, round = false } = {}) {
  const c = Math.round(cents || 0);
  const f = round ? eur0 : eur;
  let s = f.format(Math.abs(c) / 100);
  if (c < 0) s = '−' + s;
  else if (sign && c > 0) s = '+' + s;
  return s;
}

/** Kompakt für Diagramm-Achsen: 0 €, 50 €, 1.200 €, 12 Tsd. € */
export function moneyAxis(cents) {
  const v = Math.round(cents / 100);
  if (Math.abs(v) >= 10000) return num.format(Math.round(v / 1000)) + ' Tsd. €';
  return num.format(v) + ' €';
}

export const fmtNum = (n) => num.format(n);

/**
 * Wandelt Eingaben wie "1,50", "1.234,56", "1.5", "2 €", 1.5 in Cent um.
 * Gibt null zurück, wenn nichts Sinnvolles erkannt wird.
 */
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = String(input).trim().replace(/\s+/g, '').replace(/€|eur(o)?/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1); }
  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(s)) return null;

  let intPart = s, frac = '';
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const d = Math.max(lastComma, lastDot);
    intPart = s.slice(0, d).replace(/[.,]/g, '');
    frac = s.slice(d + 1);
  } else if (lastComma >= 0) {
    const p = s.split(',');
    if (p.length > 2) intPart = p.join('');
    else { intPart = p[0]; frac = p[1]; }
  } else if (lastDot >= 0) {
    const p = s.split('.');
    // "1.500" (deutsche Tausendertrennung) vs. "1.50" (Dezimalpunkt)
    if (p.length > 2 || (p[1].length === 3 && p[0] !== '0' && p[0] !== '')) intPart = p.join('');
    else { intPart = p[0]; frac = p[1]; }
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null;
  const i = parseInt(intPart || '0', 10);
  const f2 = (frac + '00').slice(0, 2);
  let cents = i * 100 + parseInt(f2, 10);
  if (frac.length > 2 && parseInt(frac[2], 10) >= 5) cents += 1;
  if (!Number.isFinite(cents)) return null;
  return neg ? -cents : cents;
}

/** Cent -> Text für Eingabefelder: 150 -> "1,50" */
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  const neg = cents < 0;
  const a = Math.abs(cents);
  const s = Math.floor(a / 100) + ',' + String(a % 100).padStart(2, '0');
  return (neg ? '-' : '') + s;
}

export function parseIntSafe(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const monthKey = (iso) => iso.slice(0, 7);
export const currentMonthKey = () => todayISO().slice(0, 7);
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function isValidISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return isoDate(d) === s;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const MONTHS_MINI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAYS_SHORT = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

export function monthLabel(key, { short = false, year = true, mini = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  if (mini) return MONTHS_MINI[m - 1];
  const name = (short ? MONTHS_SHORT : MONTHS)[m - 1];
  return year ? `${name} ${y}` : name;
}

/** "8. Nov. 2026" (Jahr nur, wenn nicht aktuelles Jahr oder force) */
export function fmtDate(iso, { year = 'auto', weekday = false } = {}) {
  if (!iso) return '';
  const d = parseISO(iso);
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== new Date().getFullYear());
  let s = `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
  if (showYear) s += ` ${d.getFullYear()}`;
  if (weekday) s = `${DAYS_SHORT[d.getDay()]} ${s}`;
  return s;
}
export function fmtDateLong(iso) {
  const d = parseISO(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateNumeric(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
/** "Heute", "Gestern", sonst "Sa. 8. Nov." */
export function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Heute';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === isoDate(y)) return 'Gestern';
  return fmtDate(iso, { weekday: true });
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${fmtDate(isoDate(d), { year: true })}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}
export function daysBetween(aISO, bISO) {
  return Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000);
}

// ---------- Text ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const normName = (s) =>
  String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');

export function plural(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function isSafeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
