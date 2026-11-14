// Fachliche Begriffe und Rechenregeln an einer Stelle.

export const PRODUCT_CATS = {
  fisch:     { label: 'Fisch',    plural: 'Fische' },
  garnele:   { label: 'Garnele',  plural: 'Garnelen' },
  schnecke:  { label: 'Schnecke', plural: 'Schnecken' },
  pflanze:   { label: 'Pflanze',  plural: 'Pflanzen' },
  zubehoer:  { label: 'Zubehör',  plural: 'Zubehör' },
  sonstiges: { label: 'Sonstiges', plural: 'Sonstiges' },
};
export const PRODUCT_CAT_KEYS = Object.keys(PRODUCT_CATS);

export const CHANNELS = {
  ka:    { label: 'Kleinanzeigen', short: 'Kleinanzeigen' },
  messe: { label: 'Messe / Börse', short: 'Messe' },
  other: { label: 'Sonstiges',     short: 'Sonstiges' },
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);

export const EXPENSE_CATS = {
  technik:   'Technik & Zubehör',
  tiere:     'Tiere (Nachkauf)',
  futter:    'Futter & Pflege',
  pflanzen:  'Pflanzen & Deko',
  versand:   'Verpackung & Versand',
  messe:     'Messe & Fahrt',
  sonstiges: 'Sonstiges',
};
export const EXPENSE_CAT_KEYS = Object.keys(EXPENSE_CATS);

export const ENTRY_TYPES = {
  sale:       { label: 'Verkauf',         plural: 'Verkäufe' },
  expense:    { label: 'Ausgabe',         plural: 'Ausgaben' },
  withdrawal: { label: 'Privatentnahme',  plural: 'Entnahmen' },
  deposit:    { label: 'Einlage',         plural: 'Einlagen' },
  adjust:     { label: 'Kassenabgleich',  plural: 'Abgleiche' },
};

/**
 * Wirkung eines Eintrags auf den Kassenstand (in Cent, vorzeichenbehaftet).
 * Offene (reservierte, noch nicht bezahlte) Verkäufe zählen nicht.
 */
export function balanceEffect(e) {
  if (e.status === 'open') return 0;
  switch (e.type) {
    case 'sale': return e.amount;
    case 'deposit': return e.amount;
    case 'expense': return -e.amount;
    case 'withdrawal': return -e.amount;
    case 'adjust': return e.amount; // bereits vorzeichenbehaftet
    default: return 0;
  }
}

/**
 * Abgabe: fester Prozentsatz, der von jedem Verkauf abgeht und den Gewinn mindert.
 * Der Satz wird beim Verkauf am Eintrag gespeichert (feeRate) – spätere Änderungen
 * in den Einstellungen gelten nur für neue Verkäufe.
 */
export const FEE_NAME = 'Abgabe';
export const feeFor = (amount, rate) => (rate > 0 ? Math.round((amount * rate) / 100) : 0);
/** Abgabe an einem Verkaufs-Eintrag setzen bzw. entfernen. */
export function applyFee(e, rate) {
  if (e.type === 'sale' && rate > 0) { e.feeRate = rate; e.fee = feeFor(e.amount, rate); }
  else { delete e.feeRate; delete e.fee; }
}

/** Gratis-Zugabe: „je 10 Stück 1 gratis". Gibt die Gratis-Stückzahl für eine bezahlte Menge zurück. */
export function freeFor(bonus, qty) {
  if (!bonus || !(bonus.per > 0) || !(bonus.free > 0)) return 0;
  return Math.floor(qty / bonus.per) * bonus.free;
}

/** Stückpreis abhängig von der Menge (Staffelpreise). */
export function unitPriceFor(product, qty) {
  let unit = product.price;
  let best = 0;
  for (const t of product.tiers || []) {
    if (qty >= t.min && t.min > best) { best = t.min; unit = t.price; }
  }
  return unit;
}
export const lineTotal = (product, qty) => unitPriceFor(product, qty) * qty;

export function sortedTiers(tiers) {
  return [...(tiers || [])].sort((a, b) => a.min - b.min);
}

/** Kurztext der Artikel eines Verkaufs: "5× Guppy, 2× Red Cherry" */
export function itemsSummary(items, max = 3) {
  if (!items || !items.length) return '';
  const parts = items.slice(0, max).map((i) => `${i.qty + (i.free || 0)}× ${i.name}`);
  if (items.length > max) parts.push(`+${items.length - max}`);
  return parts.join(', ');
}

export function entryTitle(e, events) {
  switch (e.type) {
    case 'sale':
      if (e.items && e.items.length) return itemsSummary(e.items);
      if (e.eventId && events) {
        const ev = events.find((x) => x.id === e.eventId);
        if (ev && !e.note) return `Einnahmen ${ev.name}`;
      }
      return e.note || 'Verkauf';
    case 'expense': return EXPENSE_CATS[e.category] || 'Ausgabe';
    case 'withdrawal': return 'Privatentnahme';
    case 'deposit': return 'Einlage';
    case 'adjust': return 'Kassenabgleich';
    default: return 'Eintrag';
  }
}

export function itemsQty(items) {
  return (items || []).reduce((s, i) => s + i.qty + (i.free || 0), 0);
}

/** Bestand abziehen; gibt zurück, wie viel tatsächlich abgezogen wurde (nie unter 0). */
export function takeStock(p, qty) {
  if (!p || p.stock == null || qty <= 0) return 0;
  const t = Math.min(qty, Math.max(0, p.stock));
  p.stock -= t;
  return t;
}
/** Genau das zurückbuchen, was beim Verkauf abgezogen wurde. */
export function returnStock(p, item) {
  if (!p || p.stock == null) return;
  p.stock += item.taken ?? (item.qty + (item.free || 0));
}
