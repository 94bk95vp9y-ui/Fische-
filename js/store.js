// Zustand + Speicherung.
// Primär IndexedDB (viel Platz, auch für Fotos). Zusätzlich eine Sicherheitskopie
// der Daten OHNE Fotos im localStorage – falls IndexedDB einmal klemmt,
// gehen wenigstens Verkäufe und Ausgaben nicht verloren.

import { balanceEffect } from './model.js';
import { monthKey, todayISO, daysBetween } from './util.js';

const DB_NAME = 'fischkasse';
const KV = 'kv';
const MIRROR_KEY = 'fk-mirror-v1';
export const SCHEMA = 1;

const fresh = () => ({
  schema: SCHEMA,
  savedAt: 0,
  products: [],
  entries: [],
  events: [],
  settings: {
    lastBackup: null,
    defaultChannel: 'ka',
    activeEventId: null,
    installHintHidden: false,
    welcomeHidden: false,
    createdAt: Date.now(),
  },
});

export const store = {
  state: fresh(),
  rev: 0,
  storage: 'idb', // 'idb' | 'local' | 'none'
  saveError: null,
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

// ---------- IndexedDB ----------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KV);
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => { d.close(); dbp = null; };
      d.onclose = () => { dbp = null; };
      resolve(d);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => { dbp = null; reject(new Error('blocked')); };
  });
  return dbp;
}
async function idbGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(KV, 'readonly').objectStore(KV).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const run = async () => {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('abort'));
    });
  };
  try { await run(); } catch (e) { dbp = null; await run(); } // ein zweiter Versuch mit frischer Verbindung
}

function readMirror() {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeMirror(s) {
  try {
    const light = { ...s, products: s.products.map((p) => ({ ...p, image: p.image ? '@idb' : null })) };
    localStorage.setItem(MIRROR_KEY, JSON.stringify(light));
    return true;
  } catch { return false; }
}

function normalize(s) {
  const base = fresh();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  out.products = Array.isArray(out.products) ? out.products : [];
  out.entries = Array.isArray(out.entries) ? out.entries : [];
  out.events = Array.isArray(out.events) ? out.events : [];
  out.products.forEach((p, i) => {
    if (!Array.isArray(p.tiers)) p.tiers = [];
    if (!Array.isArray(p.priceHistory)) p.priceHistory = [];
    if (typeof p.order !== 'number') p.order = i;
    if (p.active === undefined) p.active = true;
  });
  out.schema = SCHEMA;
  return out;
}

export async function load() {
  let fromIdb = null;
  try {
    fromIdb = await idbGet('state');
  } catch (e) {
    console.warn('IndexedDB nicht verfügbar', e);
    store.storage = 'local';
  }
  const mirror = readMirror();
  let chosen = fromIdb;
  if (mirror && (!fromIdb || (mirror.savedAt || 0) > (fromIdb.savedAt || 0))) {
    // Spiegel ist neuer (z. B. IndexedDB-Schreiben ist fehlgeschlagen): Fotos aus IDB übernehmen
    const imgs = new Map((fromIdb?.products || []).map((p) => [p.id, p.image]));
    chosen = { ...mirror, products: mirror.products.map((p) => ({ ...p, image: p.image === '@idb' ? imgs.get(p.id) || null : p.image })) };
  }
  store.state = normalize(chosen || {});
  autoCleanup();
  store.rev++;
  emit();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// Messe-Modus endet automatisch, wenn die Messe vorbei ist.
function autoCleanup() {
  const s = store.state.settings;
  if (s.activeEventId) {
    const ev = store.state.events.find((e) => e.id === s.activeEventId);
    if (!ev || daysBetween(ev.date, todayISO()) > 1) s.activeEventId = null;
  }
}

// ---------- Speichern ----------
let saveTimer = null;
let saving = Promise.resolve();
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  store.state.savedAt = Date.now();
  const mirrored = writeMirror(store.state);
  saving = saving.then(async () => {
    if (store.storage === 'idb') {
      try { await idbSet('state', store.state); store.saveError = null; return; }
      catch (e) { console.error('Speichern in IndexedDB fehlgeschlagen', e); }
    }
    store.saveError = mirrored ? null : 'Speichern fehlgeschlagen – bitte ein Backup machen.';
    if (store.saveError) emit();
  });
  return saving;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flush(); });
window.addEventListener('pagehide', () => { if (saveTimer) flush(); });

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/**
 * Ändert den Zustand. Gibt eine Undo-Funktion zurück.
 */
export function commit(mutator) {
  const prev = clone(store.state);
  mutator(store.state);
  store.rev++;
  scheduleSave();
  emit();
  return () => {
    store.state = prev;
    store.rev++;
    scheduleSave();
    emit();
  };
}

/** Kompletten Zustand ersetzen (Backup laden / alles löschen). */
export function replaceState(next) {
  const prev = clone(store.state);
  store.state = normalize(next || {});
  store.rev++;
  scheduleSave();
  emit();
  return () => { store.state = prev; store.rev++; scheduleSave(); emit(); };
}
export const emptyState = fresh;

// ---------- Auswertungen (gecacht je Revision) ----------
let cache = { rev: -1 };
function stats() {
  if (cache.rev === store.rev) return cache;
  const s = store.state;
  const months = new Map();
  const totals = blank();
  let balance = 0;
  for (const e of s.entries) {
    balance += balanceEffect(e);
    if (e.status === 'open') continue;
    const k = monthKey(e.date);
    if (!months.has(k)) months.set(k, blank());
    add(months.get(k), e);
    add(totals, e);
  }
  cache = { rev: store.rev, months, totals, balance };
  return cache;
}
function blank() {
  // sales = einzelne Verkäufe (Kunden); Messe-Tagessummen zählen extra (lumpSales),
  // weil darin viele Kunden stecken – sonst wäre „Ø pro Verkauf“ verzerrt.
  return { revenue: 0, expenses: 0, withdrawals: 0, deposits: 0, adjust: 0, sales: 0, salesRevenue: 0, lumpSales: 0, items: 0, byChannel: { ka: 0, messe: 0, other: 0 }, byExpense: {} };
}
function add(m, e) {
  switch (e.type) {
    case 'sale':
      m.revenue += e.amount;
      if (e.channel === 'messe' && !(e.items && e.items.length)) m.lumpSales++;
      else { m.sales++; m.salesRevenue += e.amount; }
      m.byChannel[e.channel || 'other'] = (m.byChannel[e.channel || 'other'] || 0) + e.amount;
      for (const i of e.items || []) m.items += i.qty;
      break;
    case 'expense':
      m.expenses += e.amount;
      m.byExpense[e.category || 'sonstiges'] = (m.byExpense[e.category || 'sonstiges'] || 0) + e.amount;
      break;
    case 'withdrawal': m.withdrawals += e.amount; break;
    case 'deposit': m.deposits += e.amount; break;
    case 'adjust': m.adjust += e.amount; break;
  }
}

export const getBalance = () => stats().balance;
export const getTotals = () => withProfit(stats().totals);
export const getMonth = (key) => withProfit(stats().months.get(key) || blank());
export const monthKeys = () => [...stats().months.keys()].sort();
function withProfit(m) {
  return { ...m, profit: m.revenue - m.expenses, avgSale: m.sales ? Math.round(m.salesRevenue / m.sales) : null };
}

export function yearTotals(year) {
  const t = blank();
  for (const [k, m] of stats().months) {
    if (!k.startsWith(year + '-')) continue;
    t.revenue += m.revenue; t.expenses += m.expenses; t.withdrawals += m.withdrawals;
    t.deposits += m.deposits; t.adjust += m.adjust; t.sales += m.sales; t.items += m.items;
    t.salesRevenue += m.salesRevenue; t.lumpSales += m.lumpSales;
    for (const c in m.byChannel) t.byChannel[c] = (t.byChannel[c] || 0) + m.byChannel[c];
    for (const c in m.byExpense) t.byExpense[c] = (t.byExpense[c] || 0) + m.byExpense[c];
  }
  return withProfit(t);
}

/**
 * Artikel-Auswertung für eine Auswahl an Einträgen.
 * Umsatz je Artikel wird anteilig korrigiert, wenn beim Verkauf ein Rabatt/Aufpreis gegeben wurde.
 */
export function productRanking(filterFn = () => true) {
  const map = new Map();
  for (const e of store.state.entries) {
    if (e.type !== 'sale' || e.status === 'open' || !e.items || !e.items.length || !filterFn(e)) continue;
    const factor = e.listTotal > 0 ? e.amount / e.listTotal : 1;
    for (const i of e.items) {
      const key = i.pid || 'name:' + i.name;
      const cur = map.get(key) || { pid: i.pid, name: i.name, qty: 0, revenue: 0 };
      cur.qty += i.qty;
      cur.revenue += Math.round(i.total * factor);
      cur.name = i.name;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

export function productSold(pid) {
  return productRanking((e) => e.items.some((i) => i.pid === pid)).find((r) => r.pid === pid) || { qty: 0, revenue: 0 };
}

export function sortedEntries(list = store.state.entries) {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
}

export function eventStats(eventId) {
  let revenue = 0, costs = 0, sales = 0;
  for (const e of store.state.entries) {
    if (e.eventId !== eventId || e.status === 'open') continue;
    if (e.type === 'sale') { revenue += e.amount; sales++; }
    if (e.type === 'expense') costs += e.amount;
  }
  return { revenue, costs, profit: revenue - costs, sales };
}

export const getProduct = (id) => store.state.products.find((p) => p.id === id);
export const getEvent = (id) => store.state.events.find((e) => e.id === id);
export const activeProducts = () => store.state.products.filter((p) => p.active).sort((a, b) => a.order - b.order);
export const sortedProducts = () => [...store.state.products].sort((a, b) => a.order - b.order);
export const sortedEvents = () => [...store.state.events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
export const activeEvent = () => {
  const id = store.state.settings.activeEventId;
  return id ? getEvent(id) || null : null;
};
