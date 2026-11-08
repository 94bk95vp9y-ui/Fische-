// Formulare und Detailansichten für Einträge (Verkauf, Ausgabe, Entnahme, Einlage, Abgleich, Messe).
import { store, commit, getEvent, getProduct, sortedEvents, getBalance } from './store.js';
import { openSheet, actionSheet, createKeypad, undoToast, toast, confirmDanger } from './ui.js';
import { esc, money, uid, todayISO, isValidISO, fmtDateLong, fmtDateTime, parseMoney, centsToInput, fmtDate } from './util.js';
import { CHANNELS, CHANNEL_KEYS, EXPENSE_CATS, EXPENSE_CAT_KEYS, ENTRY_TYPES, entryTitle, itemsQty, unitPriceFor, takeStock, returnStock } from './model.js';
import { seg, chips, bindChoice } from './components.js';
import { icon } from './icons.js';
import { go } from './nav.js';

const TYPE_OPTIONS = [
  { value: 'sale', label: 'Verkauf' },
  { value: 'expense', label: 'Ausgabe' },
  { value: 'withdrawal', label: 'Entnahme' },
  { value: 'deposit', label: 'Einlage' },
];
const HINTS = {
  sale: 'Schnell erfasst, ohne einzelne Artikel zu zählen.',
  expense: 'Geld, das du für das Hobby/Geschäft ausgegeben hast. Mindert den Gewinn.',
  withdrawal: 'Geld, das du privat herausnimmst. Mindert den Kassenstand, nicht den Gewinn.',
  deposit: 'Eigenes Geld, das du hineinlegst – z. B. ein Startbetrag. Kein Umsatz.',
};

function eventOptions(selected, { allowNone = false } = {}) {
  const evs = sortedEvents();
  let html = allowNone ? `<option value="">Keiner Messe zuordnen</option>` : '';
  if (!allowNone && !evs.length) html += `<option value="" disabled ${!selected ? 'selected' : ''}>Noch keine Messe angelegt</option>`;
  html += evs.map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)} · ${esc(fmtDate(e.date))}</option>`).join('');
  html += `<option value="__new">Neue Messe anlegen …</option>`;
  return html;
}

/** Event-Auswahl: bei "__new" das Messe-Formular öffnen und danach auswählen */
function bindEventSelect(select, getFallback) {
  select.addEventListener('change', () => {
    if (select.value !== '__new') return;
    const prev = getFallback();
    if (prev) select.value = prev; else select.selectedIndex = 0;
    openEventForm(null, {
      onSaved: (ev) => {
        select.innerHTML = eventOptions(ev.id, { allowNone: select.dataset.allowNone === '1' });
        select.value = ev.id;
        select.dispatchEvent(new Event('change'));
      },
      simple: true,
    });
  });
}

// ------------------------------------------------------------------
// Schnell-Eintrag mit Ziffernblock (Verkauf ohne Artikel, Ausgabe, Entnahme, Einlage)
// ------------------------------------------------------------------
export function openEntryForm({ type = 'sale', entry = null, preset = {} } = {}) {
  const editing = !!entry;
  const st = store.state;
  const activeEv = st.settings.activeEventId && getEvent(st.settings.activeEventId);
  const v = {
    type: entry ? entry.type : type,
    channel: entry?.channel || preset.channel || (activeEv ? 'messe' : st.settings.defaultChannel || 'ka'),
    eventId: entry?.eventId || preset.eventId || (activeEv && (type === 'sale' || preset.channel === 'messe') ? activeEv.id : ''),
    category: entry?.category || preset.category || 'technik',
    date: entry?.date || preset.date || todayISO(),
    note: entry?.note || preset.note || '',
  };
  if (v.type === 'sale' && v.eventId) v.channel = 'messe';

  const typeLabel = (t) => (editing ? `${ENTRY_TYPES[t].label} bearbeiten` : 'Neuer Eintrag');
  const sheet = openSheet({
    title: typeLabel(v.type),
    right: 'Sichern',
    cls: 'sheet-keypad',
    dirty: () => kp.getCents() !== (entry ? entry.amount : null) && kp.buffer !== '',
    content: `
      ${editing ? '' : seg('type', TYPE_OPTIONS, v.type, 'seg-type')}
      <div class="amount-display" data-display>
        <span class="amount-value"><span data-amt>0</span> €</span>
        <span class="amount-hint" data-hint></span>
      </div>
      <div data-typefields></div>
      <div class="group compact">
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${esc(v.date)}"></label>
        <label class="field row-field"><span class="field-label">${icon('pencil')}Notiz</span><input type="text" class="in" data-f="note" value="${esc(v.note)}" placeholder="optional" enterkeyhint="done" maxlength="140"></label>
      </div>`,
    foot: '',
    onRight: () => save(),
  });
  const body = sheet.body;
  const kp = createKeypad({ initial: entry ? entry.amount : null, onChange: () => updateDisplay() });
  sheet.foot.appendChild(kp.el);

  const fields = body.querySelector('[data-typefields]');
  function renderTypeFields() {
    let html = '';
    if (v.type === 'sale') {
      html = `<div class="sec-label">Verkauft über</div>${chips('channel', CHANNEL_KEYS.map((k) => ({ value: k, label: CHANNELS[k].short })), v.channel)}
        ${v.channel === 'messe' ? `<div class="group compact"><label class="field row-field"><span class="field-label">${icon('stall')}Messe</span><select class="in" data-f="event">${eventOptions(v.eventId)}</select></label></div>` : ''}`;
    } else if (v.type === 'expense') {
      html = `<div class="sec-label">Wofür?</div>${chips('category', EXPENSE_CAT_KEYS.map((k) => ({ value: k, label: EXPENSE_CATS[k] })), v.category)}
        ${st.events.length ? `<div class="group compact"><label class="field row-field"><span class="field-label">${icon('stall')}Messe</span><select class="in" data-f="event" data-allow-none="1">${eventOptions(v.eventId, { allowNone: true })}</select></label></div>` : ''}`;
    }
    fields.innerHTML = html;
    const sel = fields.querySelector('[data-f="event"]');
    if (sel) {
      bindEventSelect(sel, () => v.eventId);
      sel.addEventListener('change', () => { if (sel.value !== '__new') v.eventId = sel.value; });
      if (v.type === 'sale' && !v.eventId && sel.value && sel.value !== '__new') v.eventId = sel.value;
    }
    body.querySelector('[data-hint]').textContent = HINTS[v.type] || '';
  }
  function updateDisplay() {
    body.querySelector('[data-amt]').textContent = kp.display();
    body.querySelector('[data-display]').classList.toggle('is-empty', !kp.buffer);
  }
  bindChoice(body, '[data-seg="type"]', (val) => {
    v.type = val;
    if (val === 'sale' && v.channel === 'messe' && !v.eventId && activeEv) v.eventId = activeEv.id;
    renderTypeFields();
  });
  bindChoice(body, '[data-chips="channel"]', (val) => {
    v.channel = val;
    if (val === 'messe' && !v.eventId) v.eventId = activeEv?.id || sortedEvents()[0]?.id || '';
    renderTypeFields();
  });
  bindChoice(body, '[data-chips="category"]', (val) => { v.category = val; });
  renderTypeFields();
  updateDisplay();

  function save() {
    const amount = kp.getCents();
    if (!amount || amount <= 0) {
      const d = body.querySelector('[data-display]');
      d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      toast('Bitte einen Betrag eingeben');
      return false;
    }
    let date = body.querySelector('[data-f="date"]').value;
    if (!isValidISO(date)) date = todayISO();
    const note = body.querySelector('[data-f="note"]').value.trim();
    if (v.type === 'sale' && v.channel === 'messe' && !v.eventId) {
      toast('Bitte eine Messe auswählen oder anlegen');
      return false;
    }
    const data = { type: v.type, amount, date, note };
    if (v.type === 'sale') { data.channel = v.channel; data.eventId = v.channel === 'messe' ? v.eventId : null; }
    if (v.type === 'expense') { data.category = v.category; data.eventId = v.eventId || null; }

    if (editing) {
      const undo = commit((s) => {
        const e = s.entries.find((x) => x.id === entry.id);
        if (!e) return;
        Object.assign(e, data, { updatedAt: Date.now() });
        if (e.type !== 'sale') { delete e.channel; }
        if (e.type !== 'expense') { delete e.category; }
        if (!e.eventId) delete e.eventId;
      });
      undoToast('Änderung gespeichert', undo);
    } else {
      const e = { id: uid(), ...data, createdAt: Date.now() };
      if (!e.eventId) delete e.eventId;
      const undo = commit((s) => { s.entries.push(e); });
      const sign = v.type === 'sale' || v.type === 'deposit' ? money(amount, { sign: true }) : money(-amount);
      undoToast(`${ENTRY_TYPES[v.type].label} gespeichert · ${sign}`, undo);
    }
    return true;
  }
  return sheet;
}

// ------------------------------------------------------------------
// Detailansicht eines Eintrags
// ------------------------------------------------------------------
export function openEntryDetail(id) {
  const e = store.state.entries.find((x) => x.id === id);
  if (!e) return;
  const ev = e.eventId ? getEvent(e.eventId) : null;
  const rows = [];
  rows.push(['Datum', esc(fmtDateLong(e.date))]);
  if (e.type === 'sale') {
    rows.push(['Verkauft über', esc((CHANNELS[e.channel] || CHANNELS.other).label)]);
  }
  if (ev) rows.push(['Messe', `<button type="button" class="link" data-act="event">${esc(ev.name)} ${icon('chevR')}</button>`]);
  if (e.type === 'expense') rows.push(['Kategorie', esc(EXPENSE_CATS[e.category] || 'Sonstiges')]);
  if (e.note) rows.push(['Notiz', esc(e.note)]);
  if (e.status === 'open') rows.push(['Status', '<em class="pill">offen – noch nicht bezahlt</em>']);
  rows.push(['Erfasst', esc(fmtDateTime(e.createdAt || Date.now()))]);
  if (e.updatedAt) rows.push(['Geändert', esc(fmtDateTime(e.updatedAt))]);

  let itemsHtml = '';
  if (e.items && e.items.length) {
    const diff = e.amount - e.listTotal;
    itemsHtml = `<div class="sec-label">${itemsQty(e.items)} Stück</div>
      <div class="group">
        ${e.items.map((i) => `<div class="line"><span class="line-name">${esc(i.name)}<small>${i.qty} × ${money(i.unit)}</small></span><span class="line-amt">${money(i.total)}</span></div>`).join('')}
        ${diff !== 0 ? `<div class="line sub"><span>Summe laut Preisen</span><span>${money(e.listTotal)}</span></div>
          <div class="line sub"><span>${diff < 0 ? 'Rabatt' : 'Aufpreis'}</span><span>${money(diff, { sign: true })}</span></div>` : ''}
        <div class="line total"><span>${e.status === 'open' ? 'Zu zahlen' : 'Bezahlt'}</span><span>${money(e.amount)}</span></div>
      </div>`;
  }

  const sign = e.type === 'sale' || e.type === 'deposit' || (e.type === 'adjust' && e.amount > 0) ? 1 : -1;
  const amtCls = e.status === 'open' ? 'muted' : e.type === 'sale' ? 'pos' : e.type === 'expense' ? 'neg' : '';
  const sheet = openSheet({
    title: ENTRY_TYPES[e.type].label,
    left: 'Schließen',
    right: e.type === 'adjust' ? null : 'Bearbeiten',
    onLeft: (s) => s.close(),
    onRight: () => {
      setTimeout(() => (e.items && e.items.length ? openSaleEdit(e.id) : openEntryForm({ entry: e })), 50);
      return true;
    },
    content: `
      <div class="detail-head">
        <span class="detail-amt ${amtCls}">${e.type === 'adjust' ? money(e.amount, { sign: true }) : money(sign * e.amount, { sign: sign > 0 })}</span>
        <span class="detail-title">${esc(entryTitle(e, store.state.events))}</span>
      </div>
      ${e.status === 'open' ? `<button type="button" class="btn primary block" data-act="paid">${icon('check')}Als bezahlt markieren</button>` : ''}
      <div class="group">${rows.map(([k, val]) => `<div class="kv"><span>${k}</span><span>${val}</span></div>`).join('')}</div>
      ${itemsHtml}
      <button type="button" class="btn danger block" data-act="delete">${icon('trash')}Eintrag löschen</button>`,
  });
  sheet.body.addEventListener('click', async (evt) => {
    const a = evt.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'event') { sheet.close(); go('messe/' + e.eventId); }
    if (a.dataset.act === 'paid') { sheet.close(); markPaid(e.id); }
    if (a.dataset.act === 'delete') {
      const hasStock = (e.items || []).some((i) => getProduct(i.pid)?.stock != null);
      const ok = await confirmDanger(hasStock ? 'Der Bestand der Artikel wird wieder zurückgebucht.' : 'Das lässt sich direkt danach noch rückgängig machen.', 'Eintrag löschen');
      if (!ok) return;
      sheet.close();
      deleteEntry(e.id);
    }
  });
}

export function deleteEntry(id) {
  const undo = commit((s) => {
    const idx = s.entries.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [e] = s.entries.splice(idx, 1);
    for (const i of e.items || []) returnStock(s.products.find((x) => x.id === i.pid), i);
  });
  undoToast('Eintrag gelöscht', undo);
}

export function markPaid(id) {
  const undo = commit((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (!e) return;
    delete e.status;
    e.date = todayISO();
    e.updatedAt = Date.now();
  });
  undoToast('Als bezahlt verbucht', undo);
}

// ------------------------------------------------------------------
// Verkauf mit Artikeln bearbeiten
// ------------------------------------------------------------------
export function openSaleEdit(id) {
  const orig = store.state.entries.find((x) => x.id === id);
  if (!orig) return;
  const items = orig.items.map((i) => ({ ...i }));
  const v = { channel: orig.channel || 'ka', eventId: orig.eventId || '' };
  let paidTouched = orig.amount !== orig.listTotal;
  let changed = false;

  const sheet = openSheet({
    title: 'Verkauf bearbeiten',
    right: 'Sichern',
    dirty: () => changed,
    content: `
      <div class="sec-label">Artikel</div>
      <div class="group" data-items></div>
      <div class="group">
        <label class="field"><span class="field-label">Kunde hat bezahlt (€)</span>
          <input class="in big" data-f="paid" inputmode="decimal" autocomplete="off" value="${esc(centsToInput(orig.amount))}"></label>
      </div>
      <div class="sec-label">Verkauft über</div>
      ${chips('channel', CHANNEL_KEYS.map((k) => ({ value: k, label: CHANNELS[k].short })), v.channel)}
      <div class="group compact" data-eventwrap ${v.channel === 'messe' ? '' : 'hidden'}>
        <label class="field row-field"><span class="field-label">${icon('stall')}Messe</span><select class="in" data-f="event">${eventOptions(v.eventId)}</select></label>
      </div>
      <div class="group compact">
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${esc(orig.date)}"></label>
        <label class="field row-field"><span class="field-label">${icon('pencil')}Notiz</span><input type="text" class="in" data-f="note" value="${esc(orig.note || '')}" placeholder="optional" maxlength="140"></label>
      </div>`,
    onRight: () => save(),
  });
  const body = sheet.body;
  body.addEventListener('input', () => { changed = true; });
  body.addEventListener('change', () => { changed = true; });
  const paidIn = body.querySelector('[data-f="paid"]');
  const listTotal = () => items.reduce((s, i) => s + i.unit * i.qty, 0);
  function renderItems() {
    body.querySelector('[data-items]').innerHTML = items.map((i, idx) => `
      <div class="line edit ${i.qty === 0 ? 'removed' : ''}">
        <span class="line-name">${esc(i.name)}<small>${money(i.unit)} pro Stück</small></span>
        <span class="stepper sm">
          <button type="button" data-step="-1" data-idx="${idx}" aria-label="weniger">${icon('minus')}</button>
          <span>${i.qty}</span>
          <button type="button" data-step="1" data-idx="${idx}" aria-label="mehr">${icon('plus')}</button>
        </span>
      </div>`).join('') + `<div class="line total"><span>Summe laut Preisen</span><span>${money(listTotal())}</span></div>`;
  }
  renderItems();
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const it = items[+b.dataset.idx];
    it.qty = Math.max(0, it.qty + +b.dataset.step);
    changed = true;
    renderItems();
    if (!paidTouched) paidIn.value = centsToInput(listTotal());
  });
  paidIn.addEventListener('input', () => { paidTouched = true; });
  bindChoice(body, '[data-chips="channel"]', (val) => {
    v.channel = val;
    body.querySelector('[data-eventwrap]').hidden = val !== 'messe';
    if (val === 'messe' && !v.eventId) {
      const sel = body.querySelector('[data-f="event"]');
      if (sel.value && sel.value !== '__new') v.eventId = sel.value;
    }
  });
  const sel = body.querySelector('[data-f="event"]');
  bindEventSelect(sel, () => v.eventId);
  sel.addEventListener('change', () => { if (sel.value !== '__new') v.eventId = sel.value; });

  function save() {
    const kept = items.filter((i) => i.qty > 0);
    if (!kept.length) { toast('Mindestens ein Artikel muss bleiben – sonst den Eintrag löschen'); return false; }
    const paid = parseMoney(paidIn.value);
    if (paid === null || paid < 0) { toast('Bitte einen gültigen Betrag eingeben'); paidIn.focus(); return false; }
    if (v.channel === 'messe' && !v.eventId) { toast('Bitte eine Messe auswählen'); return false; }
    let date = body.querySelector('[data-f="date"]').value;
    if (!isValidISO(date)) date = orig.date;
    const note = body.querySelector('[data-f="note"]').value.trim();
    const undo = commit((s) => {
      const e = s.entries.find((x) => x.id === id);
      if (!e) return;
      // Bestand um die Differenz korrigieren
      e.items.forEach((old, idx) => {
        const now = items[idx];
        const diff = (now ? now.qty : 0) - old.qty;
        const p = s.products.find((x) => x.id === old.pid);
        const taken = old.taken ?? old.qty;
        if (!p || p.stock == null || !diff) { if (now) now.taken = taken; return; }
        if (diff > 0) { if (now) now.taken = taken + takeStock(p, diff); }
        else { const give = Math.min(-diff, taken); p.stock += give; if (now) now.taken = taken - give; }
      });
      e.items = kept.map((i) => ({ ...i, total: i.unit * i.qty }));
      e.listTotal = e.items.reduce((a, i) => a + i.total, 0);
      e.amount = paid;
      e.channel = v.channel;
      if (v.channel === 'messe') e.eventId = v.eventId; else delete e.eventId;
      e.date = date;
      e.note = note;
      e.updatedAt = Date.now();
    });
    undoToast('Verkauf aktualisiert', undo);
    return true;
  }
}

// ------------------------------------------------------------------
// Kasse abschließen (aus dem Warenkorb)
// ------------------------------------------------------------------
export function openCheckout(lines, onDone) {
  // lines: [{product, qty, unit, total}]
  const st = store.state;
  const listTotal = lines.reduce((s, l) => s + l.total, 0);
  const activeEv = st.settings.activeEventId && getEvent(st.settings.activeEventId);
  const v = {
    channel: activeEv ? 'messe' : st.settings.defaultChannel || 'ka',
    eventId: activeEv ? activeEv.id : '',
  };
  const qty = lines.reduce((s, l) => s + l.qty, 0);

  const sheet = openSheet({
    title: 'Verkauf',
    right: 'Speichern',
    content: `
      <div class="group">
        ${lines.map((l) => `<div class="line"><span class="line-name">${esc(l.product.name)}<small>${l.qty} × ${money(l.unit)}${l.unit !== l.product.price ? ' (Staffelpreis)' : ''}</small></span><span class="line-amt">${money(l.total)}</span></div>`).join('')}
        <div class="line total"><span>Summe · ${qty} Stück</span><span>${money(listTotal)}</span></div>
      </div>
      <div class="group">
        <label class="field"><span class="field-label">Kunde zahlt (€)</span>
          <input class="in big" data-f="paid" inputmode="decimal" autocomplete="off" value="${esc(centsToInput(listTotal))}"></label>
        <div class="field-note" data-diff></div>
      </div>
      <div class="sec-label">Verkauft über</div>
      ${chips('channel', CHANNEL_KEYS.map((k) => ({ value: k, label: CHANNELS[k].short })), v.channel)}
      <div class="group compact" data-eventwrap ${v.channel === 'messe' ? '' : 'hidden'}>
        <label class="field row-field"><span class="field-label">${icon('stall')}Messe</span><select class="in" data-f="event">${eventOptions(v.eventId)}</select></label>
      </div>
      <div class="group compact">
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${todayISO()}"></label>
        <label class="field row-field"><span class="field-label">${icon('pencil')}Notiz</span><input type="text" class="in" data-f="note" placeholder="z. B. Name des Käufers" maxlength="140"></label>
      </div>
      <div class="group">
        <label class="switch-row"><span><strong>Noch nicht bezahlt</strong><small>Reserviert, Abholung später. Zählt erst nach „bezahlt“ als Umsatz.</small></span>
          <input type="checkbox" class="switch" data-f="open"></label>
      </div>
      <details class="change-calc">
        <summary>Rückgeld berechnen</summary>
        <div class="group">
          <label class="field"><span class="field-label">Kunde gibt (€)</span><input class="in" data-f="given" inputmode="decimal" autocomplete="off" placeholder="z. B. 20"></label>
          <div class="field-note strong" data-change></div>
        </div>
      </details>`,
    onRight: () => save(),
  });
  const body = sheet.body;
  const paidIn = body.querySelector('[data-f="paid"]');
  const givenIn = body.querySelector('[data-f="given"]');
  function updateDiff() {
    const paid = parseMoney(paidIn.value);
    const el = body.querySelector('[data-diff]');
    if (paid === null) { el.textContent = paidIn.value ? 'Betrag nicht erkannt' : ''; return; }
    const d = paid - listTotal;
    el.textContent = d === 0 ? '' : d < 0 ? `Rabatt ${money(-d)}` : `Aufpreis ${money(d)}`;
    updateChange();
  }
  function updateChange() {
    const paid = parseMoney(paidIn.value) ?? listTotal;
    const given = parseMoney(givenIn.value);
    const el = body.querySelector('[data-change]');
    if (given === null) { el.textContent = ''; return; }
    el.textContent = given >= paid ? `Rückgeld: ${money(given - paid)}` : `Es fehlen noch ${money(paid - given)}`;
  }
  paidIn.addEventListener('input', updateDiff);
  paidIn.addEventListener('focus', () => paidIn.select());
  givenIn.addEventListener('input', updateChange);
  bindChoice(body, '[data-chips="channel"]', (val) => {
    v.channel = val;
    body.querySelector('[data-eventwrap]').hidden = val !== 'messe';
    if (val === 'messe' && !v.eventId) {
      const sel = body.querySelector('[data-f="event"]');
      if (sel.value && sel.value !== '__new') v.eventId = sel.value;
    }
  });
  const sel = body.querySelector('[data-f="event"]');
  bindEventSelect(sel, () => v.eventId);
  sel.addEventListener('change', () => { if (sel.value !== '__new') v.eventId = sel.value; });

  function save() {
    const paid = parseMoney(paidIn.value);
    if (paid === null || paid < 0) { toast('Bitte den bezahlten Betrag prüfen'); return false; }
    if (v.channel === 'messe' && !v.eventId) { toast('Bitte eine Messe auswählen oder anlegen'); return false; }
    let date = body.querySelector('[data-f="date"]').value;
    if (!isValidISO(date)) date = todayISO();
    const note = body.querySelector('[data-f="note"]').value.trim();
    const isOpen = body.querySelector('[data-f="open"]').checked;
    const e = {
      id: uid(), type: 'sale', date, amount: paid, listTotal,
      items: lines.map((l) => ({ pid: l.product.id, name: l.product.name, qty: l.qty, unit: l.unit, total: l.total, taken: 0 })),
      channel: v.channel, note, createdAt: Date.now(),
    };
    if (v.channel === 'messe') e.eventId = v.eventId;
    if (isOpen) e.status = 'open';
    const undo = commit((s) => {
      for (const it of e.items) it.taken = takeStock(s.products.find((x) => x.id === it.pid), it.qty);
      s.entries.push(e);
    });
    onDone && onDone(undo);
    undoToast(isOpen ? `Reserviert · ${money(paid)} offen` : `Verkauf gespeichert · ${money(paid, { sign: true })}`, () => { undo(); onDone && onDone(null, lines); });
    return true;
  }
}

// ------------------------------------------------------------------
// Messe / Börse anlegen oder bearbeiten
// ------------------------------------------------------------------
export function openEventForm(event = null, { onSaved = null, simple = false } = {}) {
  const editing = !!event;
  const isTodayDefault = !editing;
  const sheet = openSheet({
    title: editing ? 'Messe bearbeiten' : 'Neue Messe / Börse',
    right: 'Sichern',
    dirty: () => !!sheet.body.querySelector('[data-f="name"]').value.trim() && !editing,
    content: `
      <div class="group">
        <label class="field"><span class="field-label">Name</span><input type="text" class="in" data-f="name" value="${esc(event?.name || '')}" placeholder="z. B. Zierfischbörse Hamm" maxlength="80" autocomplete="off"></label>
        <label class="field"><span class="field-label">Datum</span><input type="date" class="in" data-f="date" value="${esc(event?.date || todayISO())}"></label>
        <label class="field"><span class="field-label">Ort</span><input type="text" class="in" data-f="place" value="${esc(event?.place || '')}" placeholder="optional" maxlength="80"></label>
      </div>
      ${!editing && !simple ? `
      <div class="sec-label">Direkt eintragen (optional)</div>
      <div class="group">
        <label class="field"><span class="field-label">Einnahmen gesamt (€)</span><input class="in" data-f="rev" inputmode="decimal" autocomplete="off" placeholder="z. B. 200"></label>
        <label class="field"><span class="field-label">Standgebühr (€)</span><input class="in" data-f="fee" inputmode="decimal" autocomplete="off" placeholder="0"></label>
        <label class="field"><span class="field-label">Fahrt & Sonstiges (€)</span><input class="in" data-f="travel" inputmode="decimal" autocomplete="off" placeholder="0"></label>
      </div>
      <p class="hint">Trage die <strong>Einnahmen vor Abzug</strong> der Kosten ein – die Kosten werden separat als Ausgabe gebucht, sonst würden sie doppelt abgezogen. Wenn du auf der Messe lieber jeden Verkauf einzeln in der Kasse zählst, lass „Einnahmen“ leer und aktiviere den Messe-Modus.</p>` : ''}
      ${!editing ? `
      <div class="group">
        <label class="switch-row"><span><strong>Messe-Modus starten</strong><small>Verkäufe in der Kasse werden automatisch dieser Messe zugeordnet.</small></span>
          <input type="checkbox" class="switch" data-f="active" ${isTodayDefault ? 'checked' : ''}></label>
      </div>` : ''}`,
    onRight: () => save(),
  });
  const body = sheet.body;
  const dateIn = body.querySelector('[data-f="date"]');
  const activeIn = body.querySelector('[data-f="active"]');
  if (activeIn) dateIn.addEventListener('change', () => { activeIn.checked = dateIn.value === todayISO(); });

  function save() {
    const name = body.querySelector('[data-f="name"]').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben'); body.querySelector('[data-f="name"]').focus(); return false; }
    let date = dateIn.value;
    if (!isValidISO(date)) date = todayISO();
    const place = body.querySelector('[data-f="place"]').value.trim();
    if (editing) {
      const undo = commit((s) => {
        const ev = s.events.find((x) => x.id === event.id);
        if (ev) Object.assign(ev, { name, date, place });
      });
      undoToast('Messe gespeichert', undo);
      return true;
    }
    const val = (f) => { const el = body.querySelector(`[data-f="${f}"]`); return el ? parseMoney(el.value) : null; };
    const rev = val('rev'), fee = val('fee'), travel = val('travel');
    for (const [f, x] of [['rev', rev], ['fee', fee], ['travel', travel]]) {
      const el = body.querySelector(`[data-f="${f}"]`);
      if (el && el.value.trim() && (x === null || x < 0)) { toast('Ein Betrag wurde nicht erkannt'); el.focus(); return false; }
    }
    const ev = { id: uid(), name, date, place, createdAt: Date.now() };
    const now = Date.now();
    const undo = commit((s) => {
      s.events.push(ev);
      if (rev > 0) s.entries.push({ id: uid(), type: 'sale', amount: rev, date, channel: 'messe', eventId: ev.id, note: 'Tageseinnahmen', createdAt: now });
      if (fee > 0) s.entries.push({ id: uid(), type: 'expense', amount: fee, date, category: 'messe', eventId: ev.id, note: 'Standgebühr', createdAt: now + 1 });
      if (travel > 0) s.entries.push({ id: uid(), type: 'expense', amount: travel, date, category: 'messe', eventId: ev.id, note: 'Fahrt & Sonstiges', createdAt: now + 2 });
      if (activeIn && activeIn.checked) s.settings.activeEventId = ev.id;
    });
    undoToast(activeIn && activeIn.checked ? 'Messe angelegt · Messe-Modus aktiv' : 'Messe angelegt', undo);
    onSaved && onSaved(ev);
    return true;
  }
}

// ------------------------------------------------------------------
// Kassenabgleich: tatsächlich gezähltes Geld eintragen
// ------------------------------------------------------------------
export function openAdjust() {
  const bal = getBalance();
  const sheet = openSheet({
    title: 'Kasse abgleichen',
    right: 'Buchen',
    cls: 'sheet-keypad',
    foot: '',
    content: `
      <p class="hint top">Zähl nach, wie viel Geld aus dem Verkauf tatsächlich da ist (bar + Konto). Die App bucht die Differenz als Korrektur – Umsatz und Gewinn bleiben unverändert.</p>
      <div class="amount-display is-empty" data-display>
        <span class="amount-label">Tatsächlich vorhanden</span>
        <span class="amount-value"><span data-amt>0</span> €</span>
      </div>
      <div class="group compact">
        <div class="kv"><span>Laut App</span><span>${money(bal)}</span></div>
        <div class="kv"><span>Differenz</span><span data-diff>–</span></div>
        <label class="field row-field"><span class="field-label">${icon('pencil')}Notiz</span><input type="text" class="in" data-f="note" placeholder="z. B. Wechselgeld vergessen" maxlength="140"></label>
      </div>`,
    onRight: () => {
      const c = kp.getCents();
      if (c === null) { toast('Bitte den gezählten Betrag eingeben'); return false; }
      const diff = c - bal;
      if (diff === 0) { toast('Passt genau – nichts zu buchen'); return true; }
      const note = sheet.body.querySelector('[data-f="note"]').value.trim();
      const undo = commit((s) => { s.entries.push({ id: uid(), type: 'adjust', amount: diff, date: todayISO(), note, createdAt: Date.now() }); });
      undoToast(`Korrektur gebucht · ${money(diff, { sign: true })}`, undo);
      return true;
    },
  });
  const kp = createKeypad({
    onChange: () => {
      const b = sheet.body;
      b.querySelector('[data-amt]').textContent = kp.display();
      b.querySelector('[data-display]').classList.toggle('is-empty', !kp.buffer);
      const c = kp.getCents();
      b.querySelector('[data-diff]').textContent = c === null ? '–' : money(c - bal, { sign: true });
    },
  });
  sheet.foot.appendChild(kp.el);
}

// ------------------------------------------------------------------
// Stückzahl direkt eintippen
// ------------------------------------------------------------------
export function openQtyPad(product, qty, onSet) {
  const sheet = openSheet({
    title: product.name,
    right: 'Übernehmen',
    cls: 'sheet-keypad sheet-short',
    foot: '',
    content: `
      <div class="amount-display" data-display>
        <span class="amount-label">Menge</span>
        <span class="amount-value"><span data-amt>${qty || 0}</span> Stück</span>
        <span class="amount-hint" data-hint></span>
      </div>`,
    onRight: () => { onSet(kp.getInt() || 0); return true; },
  });
  const kp = createKeypad({
    integer: true, initial: qty || null, maxInt: 4,
    onChange: () => {
      sheet.body.querySelector('[data-amt]').textContent = kp.display();
      const n = kp.getInt() || 0;
      const p = getProduct(product.id) || product;
      const unit = unitPriceFor(p, n);
      sheet.body.querySelector('[data-hint]').textContent = n ? `${money(unit * n)}${p.stock != null && n > p.stock ? ` · nur ${p.stock} im Bestand` : ''}` : '';
    },
  });
  sheet.foot.appendChild(kp.el);
  kp.set(qty || null);
}

export async function newEntryMenu() {
  const r = await actionSheet({
    actions: [
      { label: 'Verkauf zählen (Kasse)', value: 'kasse', icon: 'basket' },
      { label: 'Betrag schnell erfassen', value: 'sale', icon: 'inArrow' },
      { label: 'Ausgabe', value: 'expense', icon: 'outArrow' },
      { label: 'Privatentnahme', value: 'withdrawal', icon: 'person' },
      { label: 'Einlage', value: 'deposit', icon: 'plusCircle' },
      { label: 'Messe / Börse', value: 'messe', icon: 'stall' },
    ],
  });
  if (!r) return;
  if (r === 'kasse') go('kasse');
  else if (r === 'messe') openEventForm();
  else openEntryForm({ type: r });
}
