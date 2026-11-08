// Prompt für eine externe KI + robuster Parser für deren Antwort.
// Die App selbst braucht keine KI: Du kopierst den Prompt, gibst ihn mit Screenshots
// deiner Anzeige in ChatGPT/Claude/Gemini, und fügst die Antwort hier wieder ein.
import { parseMoney, parseIntSafe, isSafeUrl } from './util.js';

export const AI_PROMPT = `Du hilfst mir, meine Verkaufsanzeigen für Aquarientiere (Fische, Garnelen, Schnecken, Pflanzen, Zubehör) in meine Verkaufs-App zu übertragen.

Ich schicke dir gleich Screenshots und/oder den Text einer Anzeige (z. B. von Kleinanzeigen). Lies Titel, Preis und Beschreibung und gib mir die angebotenen Artikel im unten gezeigten JSON-Format zurück.

REGELN
1. Antworte NUR mit einem einzigen JSON-Codeblock. Kein Text davor oder danach.
2. Ein Artikel pro Art bzw. Variante mit eigenem Preis. Beispiel: „Guppy Männchen 2 €, Weibchen 1,50 €" → zwei Artikel. Gleicher Preis für mehrere Farben → ein Artikel.
3. "preis" = Preis für EIN Stück in Euro, als Zahl mit Punkt (z. B. 1.5). Steht nur ein Mengenpreis da (z. B. „10 Stück 12 €"), rechne den Stückpreis aus (1.2) und trage die Menge zusätzlich in "staffelpreise" ein.
4. "staffelpreise" = Mengenrabatte, z. B. „ab 10 Stück je 1 €" → {"ab": 10, "preis": 1.0}. "preis" ist auch hier der Stückpreis. Keine Rabatte → [].
5. "kategorie" ist genau einer dieser Werte: "Fisch", "Garnele", "Schnecke", "Pflanze", "Zubehör", "Sonstiges".
6. "name" = kurzer, gebräuchlicher Name inkl. Farbe/Variante, höchstens 40 Zeichen (z. B. "Red Cherry Garnele", "Endler Guppy Black Bar", "Posthornschnecke rot"). Wörter wie „Verkaufe", „Nachzucht", „abzugeben" gehören NICHT in den Namen.
7. "bestand" = genannte verfügbare Stückzahl als ganze Zahl (bei „ca. 30" → 30), sonst null.
8. "beschreibung" = 1–2 kurze Sätze mit den wichtigsten Infos (Größe, Geschlecht, Haltung/Wasserwerte), höchstens 160 Zeichen, sonst null.
9. "link" = Link zur Anzeige, falls sichtbar, sonst null.
10. Erfinde nichts. Was nicht in der Anzeige steht, ist null. „VB" (Verhandlungsbasis): nimm den genannten Preis. Steht gar kein Preis da: "preis": null.

FORMAT
\`\`\`json
{
  "app": "fischkasse",
  "version": 1,
  "artikel": [
    {
      "name": "Red Cherry Garnele",
      "kategorie": "Garnele",
      "preis": 1.5,
      "staffelpreise": [{ "ab": 10, "preis": 1.2 }],
      "bestand": 40,
      "beschreibung": "Nachzucht aus eigenem Becken, ca. 1–2 cm, für Gesellschaftsbecken geeignet.",
      "link": null
    }
  ]
}
\`\`\`

Hier ist meine Anzeige:`;

const CAT_MAP = [
  [/^(fisch|fische|fish|zierfisch)/, 'fisch'],
  [/^(garnele|garnelen|shrimp|krebs|krebse|krabbe)/, 'garnele'],
  [/^(schnecke|schnecken|snail)/, 'schnecke'],
  [/^(pflanze|pflanzen|plant|moos)/, 'pflanze'],
  [/^(zubeh|technik|equipment|deko)/, 'zubehoer'],
];
function mapCategory(v, name) {
  const s = String(v || '').toLowerCase().trim();
  for (const [re, k] of CAT_MAP) if (re.test(s)) return k;
  // Fallback: aus dem Namen raten
  const n = String(name || '').toLowerCase();
  if (/garnele|shrimp|cherry|amano|neocaridina|caridina/.test(n)) return 'garnele';
  if (/schnecke|posthorn|turmdeckel|rennschnecke|helena/.test(n)) return 'schnecke';
  if (/moos|pflanze|anubias|cryptocoryne|javafarn/.test(n)) return 'pflanze';
  if (/guppy|endler|platy|molly|neon|salmler|wels|barbe|bärbling|fisch|kampffisch|betta/.test(n)) return 'fisch';
  return s ? 'sonstiges' : 'fisch';
}

/** Mögliche JSON-Stücke aus beliebigem KI-Text herausholen. */
function candidates(text) {
  const out = [];
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(text))) out.push(m[1]);
  const fo = text.indexOf('{'), lo = text.lastIndexOf('}');
  if (fo >= 0 && lo > fo) out.push(text.slice(fo, lo + 1));
  const fa = text.indexOf('['), la = text.lastIndexOf(']');
  if (fa >= 0 && la > fa) out.push(text.slice(fa, la + 1));
  out.push(text);
  return out;
}

// Leichte Reparatur: Kommentare, Komma vor schließender Klammer, geschützte Leerzeichen
function repairLight(s) {
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}
// Stärkere Reparatur: zusätzlich typografische Anführungszeichen (z. B. aus Notizen-Apps)
function repairQuotes(s) {
  return repairLight(s)
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
}

function tryParse(text) {
  for (const c of candidates(text)) {
    for (const variant of [c, repairLight(c), repairQuotes(c)]) {
      try { return JSON.parse(variant.trim()); } catch { /* nächster Versuch */ }
    }
  }
  return undefined;
}

const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; };

/**
 * Ergebnis: { items: [{name, category, price(cent|null), tiers, stock, note, link}] } oder { error }
 */
export function parseAiResponse(text) {
  const t = String(text || '').trim();
  if (!t) return { error: 'Das Feld ist leer. Füge die Antwort der KI ein.' };
  const data = tryParse(t);
  if (data === undefined) return { error: 'Darin wurde kein gültiges JSON gefunden. Kopiere die komplette Antwort der KI (den ganzen Codeblock) und versuche es erneut.' };
  let list = Array.isArray(data) ? data : pick(data, ['artikel', 'items', 'products', 'produkte', 'angebote']);
  if (!list && data && typeof data === 'object' && (data.name || data.titel)) list = [data];
  if (!Array.isArray(list) || !list.length) return { error: 'Die Antwort enthält keine Artikel. Prüfe, ob die KI das Format eingehalten hat.' };

  const items = [];
  for (const raw of list.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(pick(raw, ['name', 'titel', 'title', 'bezeichnung']) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) continue;
    const price = parseMoney(pick(raw, ['preis', 'price', 'stueckpreis', 'stückpreis']));
    const tiersRaw = pick(raw, ['staffelpreise', 'staffel', 'tiers', 'mengenrabatt']) || [];
    const tiers = [];
    if (Array.isArray(tiersRaw)) {
      for (const tr of tiersRaw) {
        if (!tr || typeof tr !== 'object') continue;
        const min = parseIntSafe(pick(tr, ['ab', 'min', 'menge', 'from']));
        const tp = parseMoney(pick(tr, ['preis', 'price', 'stueckpreis']));
        if (min && min >= 2 && tp !== null && tp >= 0 && !tiers.some((x) => x.min === min)) tiers.push({ min, price: tp });
      }
    }
    tiers.sort((a, b) => a.min - b.min);
    const stockRaw = pick(raw, ['bestand', 'stock', 'anzahl', 'menge']);
    const stock = stockRaw === null ? null : parseIntSafe(stockRaw);
    const linkRaw = pick(raw, ['link', 'url']);
    const note = pick(raw, ['beschreibung', 'description', 'notiz']);
    items.push({
      name,
      category: mapCategory(pick(raw, ['kategorie', 'category', 'typ', 'art']), name),
      price: price !== null && price >= 0 ? price : null,
      tiers,
      stock: stock !== null && stock >= 0 ? stock : null,
      note: note ? String(note).trim().slice(0, 400) : '',
      link: linkRaw && isSafeUrl(String(linkRaw)) ? String(linkRaw) : '',
    });
  }
  if (!items.length) return { error: 'Keiner der Einträge hatte einen Namen. Bitte die KI-Antwort prüfen.' };
  return { items };
}
