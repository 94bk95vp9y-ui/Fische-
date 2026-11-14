// Formulare und Detailansichten für Einträge (Verkauf, Ausgabe, Entnahme, Einlage, Abgleich, Messe).
import { store, commit, getEvent, getProduct, sortedEvents, getBalance, activeProducts } from './store.js';
import { openSheet, actionSheet, createKeypad, undoToast, toast, confirmDanger, openAmountPad } from './ui.js';
import { esc, money, uid, todayISO, isValidISO, fmtDateLong, fmtDateTime, fmtDate } from './util.js';
import { CHANNELS, CHANNEL_KEYS, EXPENSE_CATS, EXPENSE_CAT_KEYS, ENTRY_TYPES, entryTitle, itemsQty, unitPriceFor, takeStock, returnStock, applyFee, feeFor, freeFor, fmtRate, netOf, FEE_NAME } from './model.js';
import { seg, chips, bindChoice, sec, amountRow, setAmountRow } from './components.js';
import { icon } from './icons.js';
import { go } from './nav.js';

const TYPE_OPTIONS = [
  { value: 'sale', label: 'Einnahme' },
  { value: 'expense', label: 'Ausgabe' },
  { value: 'withdrawal', label: 'Entnahme' },
  { value: 'deposit', label: 'Einlage' },
];
const HINTS = {
  sale: 'Einnahme ohne einzelne Artikel',
  expense: 'Mindert den Gewinn',
  withdrawal: 'Für dich privat – mindert nur den Kassenstand',
  deposit: 'Eigenes Geld in die Kasse – kein Umsatz',
};
const ENTRY_LABEL = { sale: 'Einnahme', expense: 'Ausgabe', withdrawal: 'Entnahme', deposit: 'Einlage' };
const CHANNEL_OPTIONS = CHANNEL_KEYS.map((k) => ({ value: k, label: CHANNELS[k].short }));
const eventRow = (selected, allowNone = false) =>
  `<div class="group"><label class="field row-field"><span class="field-label">${icon('stall')}Messe</span><select class="in" data-f="event" ${allowNone ? 'data-allow-none="1"' : ''}>${eventOptions(selected, { allowNone })}</select></label></div>`;

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
// Abgabe: Zeile in Formularen + Eingabe des Prozentsatzes
// ------------------------------------------------------------------
const feeRowHtml = () => `<div class="group"><button type="button" class="field row-field amt-row" data-act="fee">
  <span class="field-label">${icon('tag')}<span data-feelabel></span></span><span class="amt-val" data-feeval></span></button></div>`;

function renderFee(body, rate, amount) {
  const l = body.querySelector('[data-feelabel]');
  if (!l) return;
  const fee = feeFor(amount || 0, rate);
  l.innerHTML = rate > 0 ? `${FEE_NAME} ${fmtRate(rate)} %${amount ? `<small>bleiben ${esc(money(amount - fee))}</small>` : ''}` : FEE_NAME;
  const fv = body.querySelector('[data-feeval]');
  fv.textContent = rate > 0 ? (amount ? money(-fee) : `${fmtRate(rate)} %`) : 'keine';
  fv.classList.toggle('empty', !(rate > 0));
}

/** Prozentsatz eingeben (auch mit Komma, z. B. 7,5). amount = Betrag des Verkaufs für die Vorschau. */
export function openFeePad({ title, rate, amount = null, onSet }) {
  openAmountPad({
    title, label: amount ? 'Prozent vom bezahlten Betrag' : 'Prozent von jedem neuen Verkauf', unit: '%',
    initial: rate ? Math.round(rate * 100) : null, allowEmpty: true,
    hint: (c) => {
      const r = (c || 0) / 100;
      if (r > 100) return 'Höchstens 100 %';
      if (!r) return `Leer = keine ${FEE_NAME}`;
      const a = amount || 2000;
      return `${amount ? '' : 'Beispiel: '}${money(a)} Umsatz → ${money(feeFor(a, r))} ${FEE_NAME}, ${money(a - feeFor(a, r))} bleiben`;
    },
    onSet: (c) => onSet(Math.min(100, (c || 0) / 100)),
  });
}

/** Häufige frühere Ausgaben als Vorschläge (Titel + zuletzt benutzte Kategorie) */
function expenseSuggestions() {
  const m = new Map();
  for (const e of store.state.entries) {
    if (e.type !== 'expense' || !e.note || e.eventId) continue;
    const k = e.note.trim();
    const c = m.get(k) || { note: k, n: 0, category: e.category, last: 0 };
    c.n++;
    if ((e.createdAt || 0) >= c.last) { c.last = e.createdAt || 0; c.category = e.category; }
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 5);
}

const NOTE_PH = {
  sale: 'Notiz, z. B. Name des Käufers',
  expense: 'Was war das? z. B. LED-Lampe',
  withdrawal: 'Notiz (optional)',
  deposit: 'Notiz (optional)',
};

// ------------------------------------------------------------------
// Schnell-Eintrag mit Ziffernblock (Einnahme ohne Artikel, Ausgabe, Entnahme, Einlage)
// ------------------------------------------------------------------
export function openEntryForm({ type = 'sale', entry = null, preset = {} } = {}) {
  const editing = !!entry;
  const st = store.state;
  const activeEv = st.settings.activeEventId && getEvent(st.settings.activeEventId);
  const v = {
    type: entry ? entry.type : type,
    channel: entry?.channel || preset.channel || (activeEv ? 'messe' : st.settings.defaultChannel || 'ka'),
    eventId: entry?.eventId || preset.eventId || (activeEv && (type === 'sale' || preset.channel === 'messe') ? activeEv.id : ''),
    category: entry?.category || preset.category || st.settings.lastExpenseCat || 'technik',
    date: entry?.date || preset.date || todayISO(),
    note: entry?.note || preset.note || '',
    feeRate: editing ? entry.feeRate || 0 : st.settings.feeRate || 0,
  };
  if (v.type === 'sale' && v.eventId) v.channel = 'messe';
  const sugg = editing ? [] : expenseSuggestions();
  let touched = false;

  const sheet = openSheet({
    title: editing ? `${ENTRY_LABEL[v.type]} ändern` : 'Neuer Eintrag',
    right: 'Speichern',
    cls: 'sheet-keypad',
    dirty: () => touched || (kp.buffer !== '' && kp.getCents() !== (entry ? entry.amount : null)),
    content: `
      ${editing ? '' : seg('type', TYPE_OPTIONS, v.type, 'seg-type')}
      <div class="amount-display" data-display>
        <span class="amount-value"><span data-amt>0</span> €</span>
        <span class="amount-hint" data-hint></span>
      </div>
      <div class="group">
        <label class="field row-field"><span class="field-label">${icon('pencil')}</span><input type="text" class="in left" data-f="note" value="${esc(v.note)}" enterkeyhint="done" maxlength="140" autocomplete="off" aria-label="Beschreibung"></label>
      </div>
      <div class="contents" data-typefields></div>
      <div class="group compact">
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${esc(v.date)}"></label>
      </div>`,
    foot: '',
    onRight: () => save(),
  });
  const body = sheet.body;
  const noteIn = body.querySelector('[data-f="note"]');
  const kp = createKeypad({ initial: entry ? entry.amount : null, onChange: () => updateDisplay() });
  sheet.foot.appendChild(kp.el);

  const fields = body.querySelector('[data-typefields]');
  function renderTypeFields() {
    let html = '';
    if (v.type === 'sale') {
      html = sec('Verkauft über', seg('channel', CHANNEL_OPTIONS, v.channel)) +
        (v.channel === 'messe' ? eventRow(v.eventId) : '') + feeRowHtml();
    } else if (v.type === 'expense') {
      html = (sugg.length ? `<div class="chips scroll" data-sugg ${noteIn.value.trim() ? 'hidden' : ''}>${sugg.map((x, i) => `<button type="button" class="chip" data-sugg-i="${i}">${esc(x.note)}</button>`).join('')}</div>` : '') +
        sec('Kategorie', chips('category', EXPENSE_CAT_KEYS.map((k) => ({ value: k, label: EXPENSE_CATS[k] })), v.category, 'scroll')) +
        (st.events.length ? eventRow(v.eventId, true) : '');
    }
    fields.innerHTML = html;
    const sel = fields.querySelector('[data-f="event"]');
    if (sel) {
      bindEventSelect(sel, () => v.eventId);
      sel.addEventListener('change', () => { if (sel.value !== '__new') v.eventId = sel.value; });
      if (v.type === 'sale' && !v.eventId && sel.value && sel.value !== '__new') v.eventId = sel.value;
    }
    const on = fields.querySelector('.chips.scroll .chip.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    noteIn.placeholder = NOTE_PH[v.type] || 'Notiz (optional)';
    body.querySelector('[data-hint]').textContent = HINTS[v.type] || '';
    renderFee(body, v.feeRate, kp.getCents());
  }
  function updateDisplay() {
    body.querySelector('[data-amt]').textContent = kp.display();
    body.querySelector('[data-display]').classList.toggle('is-empty', !kp.buffer);
    renderFee(body, v.feeRate, kp.getCents());
  }
  bindChoice(body, '[data-seg="type"]', (val) => {
    v.type = val;
    if (val === 'sale' && v.channel === 'messe' && !v.eventId && activeEv) v.eventId = activeEv.id;
    renderTypeFields();
  });
  bindChoice(body, '[data-seg="channel"]', (val) => {
    v.channel = val;
    if (val === 'messe' && !v.eventId) v.eventId = activeEv?.id || sortedEvents()[0]?.id || '';
    renderTypeFields();
  });
  bindChoice(body, '[data-chips="category"]', (val) => { v.category = val; touched = true; });
  noteIn.addEventListener('input', () => {
    touched = true;
    const w = body.querySelector('[data-sugg]');
    if (w) w.hidden = !!noteIn.value.trim();
  });
  body.addEventListener('change', (e) => {
  });
  body.addEventListener('click', (e) => {
    const sg = e.target.closest('[data-sugg-i]');
    if (sg) {
      const x = sugg[+sg.dataset.suggI];
      noteIn.value = x.note; v.category = x.category; touched = true;
      renderTypeFields();
      return;
    }
    if (e.target.closest('[data-act="fee"]')) {
      openFeePad({ title: FEE_NAME, rate: v.feeRate, amount: kp.getCents(), onSet: (r) => { v.feeRate = r; touched = true; renderFee(body, v.feeRate, kp.getCents()); } });
    }
  });
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
    const note = noteIn.value.trim();
    if (v.type === 'sale' && v.channel === 'messe' && !v.eventId) {
      toast('Bitte eine Messe auswählen oder anlegen');
      return false;
    }
    const data = { type: v.type, amount, date, note };
    if (v.type === 'sale') { data.channel = v.channel; data.eventId = v.channel === 'messe' ? v.eventId : null; }
    if (v.type === 'expense') { data.category = v.category; data.eventId = v.eventId || null; }
    const tidy = (e) => {
      applyFee(e, v.feeRate);
      if (e.type !== 'sale') delete e.channel;
      if (e.type !== 'expense') delete e.category;
      delete e.fromFee; // Altlast aus der kurzzeitigen „Rücklage“
      if (!e.eventId) delete e.eventId;
    };
    const remember = (s) => { if (v.type === 'expense') s.settings.lastExpenseCat = v.category; };

    if (editing) {
      const undo = commit((s) => {
        const e = s.entries.find((x) => x.id === entry.id);
        if (!e) return;
        Object.assign(e, data, { updatedAt: Date.now() });
        tidy(e);
        remember(s);
      });
      undoToast('Änderung gespeichert', undo);
    } else {
      const e = { id: uid(), ...data, createdAt: Date.now() };
      tidy(e);
      const undo = commit((s) => { s.entries.push(e); remember(s); });
      const sign = v.type === 'sale' ? money(netOf(e), { sign: true }) : v.type === 'deposit' ? money(amount, { sign: true }) : money(-amount);
      undoToast(`${ENTRY_LABEL[v.type]} gespeichert · ${sign}`, undo);
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
  if (e.type === 'expense' && e.note) rows.push(['Was', esc(e.note)]);
  if (e.type === 'expense') rows.push(['Kategorie', esc(EXPENSE_CATS[e.category] || 'Sonstiges')]);
  if (e.note && e.type !== 'expense') rows.push([e.status === 'open' ? 'Für wen' : 'Notiz', esc(e.note)]);
  if (e.type === 'sale' && e.fee) {
    rows.push(['Umsatz (Kunde hat bezahlt)', money(e.amount)]);
    rows.push([`${FEE_NAME} (${fmtRate(e.feeRate)} %)`, money(-e.fee)]);
  }
  if (e.status === 'open') rows.push(['Status', '<em class="pill">offen – noch nicht bezahlt</em>']);
  rows.push(['Erfasst', esc(fmtDateTime(e.createdAt || Date.now()))]);
  if (e.updatedAt) rows.push(['Geändert', esc(fmtDateTime(e.updatedAt))]);

  let itemsHtml = '';
  if (e.items && e.items.length) {
    const diff = e.amount - e.listTotal;
    itemsHtml = sec(`${itemsQty(e.items)} Stück`, `<div class="group">
        ${e.items.map((i) => `<div class="line"><span class="line-name">${esc(i.name)}<small>${i.qty} × ${money(i.unit)}${i.free ? ` + ${i.free} gratis` : ''}</small></span><span class="line-amt">${money(i.total)}</span></div>`).join('')}
        ${diff !== 0 ? `<div class="line sub"><span>Summe laut Preisen</span><span>${money(e.listTotal)}</span></div>
          <div class="line sub"><span>${diff < 0 ? 'Rabatt' : 'Aufpreis'}</span><span>${money(diff, { sign: true })}</span></div>` : ''}
        <div class="line total"><span>${e.status === 'open' ? 'Zu zahlen' : 'Bezahlt'}</span><span>${money(e.amount)}</span></div>
      </div>`);
  }

  const sign = e.type === 'sale' || e.type === 'deposit' || (e.type === 'adjust' && e.amount > 0) ? 1 : -1;
  const amtCls = e.status === 'open' ? 'muted' : e.type === 'sale' ? 'pos' : e.type === 'expense' ? 'neg' : '';
  const sheet = openSheet({
    title: ENTRY_TYPES[e.type].label,
    left: 'Schließen',
    right: e.type === 'adjust' ? null : 'Bearbeiten',
    rightPlain: true,
    onLeft: (s) => s.close(),
    onRight: () => {
      setTimeout(() => (e.items && e.items.length ? openSaleEdit(e.id) : openEntryForm({ entry: e })), 50);
      return true;
    },
    content: `
      <div class="detail-head">
        <span class="detail-amt ${amtCls}">${e.type === 'adjust' ? money(e.amount, { sign: true }) : money(sign * (e.type === 'sale' ? netOf(e) : e.amount), { sign: sign > 0 })}</span>
        ${e.type === 'sale' && e.fee ? `<span class="detail-sub">${money(e.amount)} Umsatz − ${money(e.fee)} ${FEE_NAME}</span>` : ''}
        <span class="detail-title">${esc(entryTitle(e, store.state.events))}</span>
      </div>
      ${e.status === 'open' ? `<button type="button" class="btn primary block" data-act="paid">${icon('check')}Als bezahlt markieren</button>` : ''}
      <div class="group">${rows.map(([k, val]) => `<div class="kv"><span>${k}</span><span>${val}</span></div>`).join('')}</div>
      ${itemsHtml}
      <button type="button" class="btn danger block" data-act="delete">${icon('trash')}${e.status === 'open' ? 'Reservierung aufheben' : 'Eintrag löschen'}</button>`,
  });
  sheet.body.addEventListener('click', async (evt) => {
    const a = evt.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'event') { sheet.close(); go('messe/' + e.eventId); }
    if (a.dataset.act === 'paid') { sheet.close(); markPaid(e.id); }
    if (a.dataset.act === 'delete') {
      const hasStock = (e.items || []).some((i) => getProduct(i.pid)?.stock != null);
      const ok = await confirmDanger(hasStock ? 'Der Bestand der Artikel wird wieder zurückgebucht.' : 'Das lässt sich direkt danach noch rückgängig machen.', e.status === 'open' ? 'Reservierung aufheben' : 'Eintrag löschen');
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
function bindEventWrap(body, v, { allowNone = false } = {}) {
  const wrap = body.querySelector('[data-eventwrap]');
  const render = () => {
    wrap.innerHTML = v.channel === 'messe' ? eventRow(v.eventId, allowNone) : '';
    const sel = wrap.querySelector('[data-f="event"]');
    if (!sel) return;
    bindEventSelect(sel, () => v.eventId);
    sel.addEventListener('change', () => { if (sel.value !== '__new') v.eventId = sel.value; });
    if (!v.eventId && sel.value && sel.value !== '__new') v.eventId = sel.value;
  };
  render();
  return render;
}

function discountText(paid, listTotal) {
  if (paid == null) return '';
  const d = paid - listTotal;
  if (d === 0) return '';
  return d < 0 ? `Rabatt ${money(-d)}` : `Aufpreis ${money(d)}`;
}

const pieces = (x) => x.qty + (x.free || 0); // inkl. Gratis-Zugabe

export function openSaleEdit(id) {
  const orig = store.state.entries.find((x) => x.id === id);
  if (!orig) return;
  const items = orig.items.map((i) => ({ ...i }));
  const v = { channel: orig.channel || 'ka', eventId: orig.eventId || '', paid: orig.amount, feeRate: orig.feeRate || 0 };
  let paidTouched = orig.amount !== orig.listTotal;
  let changed = false;
  const listTotal = () => items.reduce((a, i) => a + i.unit * i.qty, 0);

  const sheet = openSheet({
    title: 'Verkauf ändern',
    right: 'Speichern',
    dirty: () => changed,
    content: `
      ${sec('Artikel', '<div class="group" data-items></div>')}
      <div class="group">${amountRow('paid', 'Kunde hat bezahlt', v.paid)}</div>
      ${feeRowHtml()}
      ${sec('Verkauft über', seg('channel', CHANNEL_OPTIONS, v.channel))}
      <div class="contents" data-eventwrap></div>
      <div class="group compact">
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${esc(orig.date)}"></label>
        <label class="field row-field"><span class="field-label">${icon('pencil')}Notiz</span><input type="text" class="in" data-f="note" value="${esc(orig.note || '')}" placeholder="optional" maxlength="140"></label>
      </div>`,
    onRight: () => save(),
  });
  const body = sheet.body;
  body.addEventListener('input', () => { changed = true; });
  body.addEventListener('change', () => { changed = true; });
  const addable = () => activeProducts().filter((p) => !items.some((i) => i.pid === p.id));
  function renderItems() {
    body.querySelector('[data-items]').innerHTML = items.map((i, idx) => `
      <div class="line edit ${i.qty === 0 ? 'removed' : ''}">
        <span class="line-name">${esc(i.name)}<small>${money(i.unit)} pro Stück${i.free ? ` · + ${i.free} gratis` : ''}</small></span>
        <span class="stepper sm">
          <button type="button" data-step="-1" data-idx="${idx}" aria-label="weniger">${icon('minus')}</button>
          <span>${i.qty}</span>
          <button type="button" data-step="1" data-idx="${idx}" aria-label="mehr">${icon('plus')}</button>
        </span>
      </div>`).join('') +
      (addable().length ? `<button type="button" class="row add-row" data-act="add-item">${icon('plus')}<span>Artikel hinzufügen</span></button>` : '') +
      `<div class="line total"><span>Summe laut Preisen</span><span>${money(listTotal())}</span></div>`;
  }
  const syncPaid = () => {
    if (!paidTouched) { v.paid = listTotal(); setAmountRow(body, 'paid', v.paid); }
    renderFee(body, v.feeRate, v.paid);
  };
  renderItems();
  renderFee(body, v.feeRate, v.paid);
  const renderEvent = bindEventWrap(body, v);
  bindChoice(body, '[data-seg="channel"]', (val) => { v.channel = val; changed = true; renderEvent(); });

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-step]');
    if (b) {
      const it = items[+b.dataset.idx];
      it.qty = Math.max(0, it.qty + +b.dataset.step);
      if (it.bonus) it.free = freeFor(it.bonus, it.qty);
      changed = true;
      renderItems();
      syncPaid();
      return;
    }
    if (e.target.closest('[data-act="add-item"]')) {
      const list = addable();
      const pid = await actionSheet({ title: 'Artikel hinzufügen', actions: list.map((p) => ({ label: `${p.name} · ${money(p.price)}`, value: p.id })) });
      const p = pid && getProduct(pid);
      if (!p) return;
      const it = { pid: p.id, name: p.name, qty: 1, unit: p.price, total: p.price, taken: 0, isNew: true };
      if (p.bonus) { it.bonus = { per: p.bonus.per, free: p.bonus.free }; it.free = freeFor(it.bonus, 1); }
      items.push(it);
      changed = true;
      renderItems();
      syncPaid();
      return;
    }
    if (e.target.closest('[data-act="fee"]')) {
      openFeePad({ title: FEE_NAME, rate: v.feeRate, amount: v.paid, onSet: (r) => { v.feeRate = r; changed = true; renderFee(body, v.feeRate, v.paid); } });
      return;
    }
    if (e.target.closest('[data-amt="paid"]')) {
      openAmountPad({
        title: 'Kunde hat bezahlt', initial: v.paid,
        hint: (c) => discountText(c, listTotal()),
        quick: [{ label: `Summe ${money(listTotal())}`, value: listTotal() }],
        onSet: (c) => { v.paid = c; paidTouched = true; changed = true; setAmountRow(body, 'paid', c); renderFee(body, v.feeRate, v.paid); },
      });
    }
  });

  function save() {
    const kept = items.filter((i) => i.qty > 0);
    if (!kept.length) { toast('Mindestens ein Artikel muss bleiben – sonst den Eintrag löschen'); return false; }
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
        const diff = (now ? pieces(now) : 0) - pieces(old);
        const p = s.products.find((x) => x.id === old.pid);
        const taken = old.taken ?? pieces(old);
        if (!p || p.stock == null || !diff) { if (now) now.taken = taken; return; }
        if (diff > 0) { if (now) now.taken = taken + takeStock(p, diff); }
        else { const give = Math.min(-diff, taken); p.stock += give; if (now) now.taken = taken - give; }
      });
      // Neu hinzugefügte Artikel
      for (const now of items.slice(e.items.length)) now.taken = takeStock(s.products.find((x) => x.id === now.pid), pieces(now));
      e.items = kept.map(({ isNew, ...i }) => ({ ...i, total: i.unit * i.qty }));
      e.listTotal = e.items.reduce((a, i) => a + i.total, 0);
      e.amount = v.paid;
      applyFee(e, v.feeRate);
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
let showChange = false; // „Rückgeld“ bleibt offen, wenn man es einmal benutzt hat

export function openCheckout(lines, onDone) {
  // lines: [{product, qty, unit, total, free}]
  const st = store.state;
  const goods = lines.reduce((a, l) => a + l.total, 0);
  const activeEv = st.settings.activeEventId && getEvent(st.settings.activeEventId);
  const v = {
    channel: activeEv ? 'messe' : st.settings.defaultChannel || 'ka',
    eventId: activeEv ? activeEv.id : '',
    paid: goods,
    given: null,
    feeRate: st.settings.feeRate || 0,
    extra: null, // freier Betrag für etwas, das kein Artikel ist
  };
  let paidTouched = false;
  const listTotal = () => goods + (v.extra || 0);
  const qty = lines.reduce((a, l) => a + l.qty + (l.free || 0), 0);

  const sheet = openSheet({
    title: 'Verkauf',
    right: 'Verkauf speichern',
    content: `
      <section class="pay">
        <span class="pay-label">Kunde zahlt</span>
        <button type="button" class="pay-amount" data-act="paid" aria-label="Betrag ändern"><span data-paid></span>${icon('pencil')}</button>
        <span class="pay-sub" data-paysub></span>
        <button type="button" class="pay-toggle" data-act="change" ${showChange ? 'hidden' : ''}>Rückgeld berechnen</button>
        <div class="pay-change" data-changebox ${showChange ? '' : 'hidden'}>
          <span class="pay-change-label">Kunde gibt</span>
          <div class="chips center" data-given></div>
          <strong class="pay-change-res" data-change></strong>
        </div>
      </section>
      ${sec('Verkauft über', seg('channel', CHANNEL_OPTIONS, v.channel))}
      <div class="contents" data-eventwrap></div>
      ${sec(`Artikel · ${qty} Stück`, '<div class="group" data-lines></div>')}
      ${feeRowHtml()}
      <div class="group">
        <label class="switch-row"><span><strong>Noch nicht bezahlt</strong><small>Reserviert, Abholung später. Zählt erst nach „bezahlt“ als Umsatz.</small></span>
          <input type="checkbox" class="switch" data-f="open"></label>
        <label class="field row-field"><span class="field-label">${icon('pencil')}<span data-notelabel>Notiz</span></span><input type="text" class="in" data-f="note" placeholder="z. B. Name des Käufers" maxlength="140" autocomplete="off"></label>
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${todayISO()}"></label>
      </div>`,
    onRight: () => save(),
  });
  const body = sheet.body;
  const openIn = body.querySelector('[data-f="open"]');
  const noteIn = body.querySelector('[data-f="note"]');

  function renderLines() {
    body.querySelector('[data-lines]').innerHTML =
      lines.map((l) => `<div class="line"><span class="line-name">${esc(l.product.name)}<small>${l.qty} × ${money(l.unit)}${l.unit !== l.product.price ? ' · Staffelpreis' : ''}${l.free ? ` · + ${l.free} gratis` : ''}</small></span><span class="line-amt">${money(l.total)}</span></div>`).join('') +
      (v.extra ? `<button type="button" class="line" data-act="extra"><span class="line-name">Sonstiges<small>ohne Artikel · antippen zum Ändern</small></span><span class="line-amt">${money(v.extra)}</span></button>`
        : `<button type="button" class="row add-row" data-act="extra">${icon('plus')}<span>Betrag ohne Artikel dazu</span></button>`) +
      `<div class="line total"><span>Summe</span><span>${money(listTotal())}</span></div>`;
  }
  function renderPay() {
    body.querySelector('[data-paid]').textContent = money(v.paid);
    const d = discountText(v.paid, listTotal());
    body.querySelector('[data-paysub]').innerHTML = d
      ? `Summe ${esc(money(listTotal()))} · <strong>${esc(d)}</strong>`
      : 'Antippen zum Ändern, z. B. bei Rabatt';
    // Scheine, die für den Betrag reichen (max. 3) + „Anderer“
    const notes = [500, 1000, 2000, 5000, 10000].filter((n) => n >= v.paid).slice(0, 3);
    if (v.given !== null && v.given < v.paid) v.given = null;
    body.querySelector('[data-given]').innerHTML =
      notes.map((n) => `<button type="button" class="chip ${v.given === n ? 'on' : ''}" data-given-v="${n}">${money(n, { round: true })}</button>`).join('') +
      `<button type="button" class="chip ${v.given !== null && !notes.includes(v.given) ? 'on' : ''}" data-given-v="other">${v.given !== null && !notes.includes(v.given) ? esc(money(v.given)) : 'Anderer'}</button>`;
    body.querySelector('[data-change]').textContent = v.given !== null ? `Rückgeld ${money(v.given - v.paid)}` : '';
    renderFee(body, v.feeRate, v.paid);
    sheet.setRight(openIn.checked ? `Reservieren · ${money(v.paid)} offen` : `Verkauf speichern · ${money(v.paid)}`);
  }
  renderLines();
  renderPay();
  const renderEvent = bindEventWrap(body, v);
  bindChoice(body, '[data-seg="channel"]', (val) => { v.channel = val; renderEvent(); });
  openIn.addEventListener('change', () => {
    body.querySelector('[data-notelabel]').textContent = openIn.checked ? 'Für wen?' : 'Notiz';
    noteIn.placeholder = openIn.checked ? 'z. B. Martin, Abholung Samstag' : 'z. B. Name des Käufers';
    renderPay();
  });

  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="paid"]')) {
      openAmountPad({
        title: 'Kunde zahlt', initial: v.paid,
        hint: (c) => discountText(c, listTotal()),
        quick: [{ label: `Summe ${money(listTotal())}`, value: listTotal() }],
        onSet: (c) => { v.paid = c; paidTouched = true; renderPay(); },
      });
      return;
    }
    if (e.target.closest('[data-act="extra"]')) {
      openAmountPad({
        title: 'Betrag ohne Artikel', label: 'z. B. Futterprobe, Tüte, Sonstiges', initial: v.extra, allowEmpty: true,
        onSet: (c) => { v.extra = c > 0 ? c : null; if (!paidTouched) v.paid = listTotal(); renderLines(); renderPay(); },
      });
      return;
    }
    if (e.target.closest('[data-act="fee"]')) {
      openFeePad({ title: FEE_NAME, rate: v.feeRate, amount: v.paid, onSet: (r) => { v.feeRate = r; renderPay(); } });
      return;
    }
    if (e.target.closest('[data-act="change"]')) {
      showChange = true;
      e.target.closest('[data-act="change"]').hidden = true;
      body.querySelector('[data-changebox]').hidden = false;
      return;
    }
    const g = e.target.closest('[data-given-v]');
    if (g) {
      if (g.dataset.givenV === 'other') {
        openAmountPad({
          title: 'Kunde gibt', initial: v.given,
          hint: (c) => (c == null ? '' : c >= v.paid ? `Rückgeld ${money(c - v.paid)}` : `Es fehlen ${money(v.paid - c)}`),
          onSet: (c) => { v.given = c >= v.paid ? c : null; if (c < v.paid) toast('Das reicht nicht für den Betrag'); renderPay(); },
        });
      } else {
        const n = +g.dataset.givenV;
        v.given = v.given === n ? null : n;
        renderPay();
      }
    }
  });

  function save() {
    if (v.channel === 'messe' && !v.eventId) { toast('Bitte eine Messe auswählen oder anlegen'); return false; }
    let date = body.querySelector('[data-f="date"]').value;
    if (!isValidISO(date)) date = todayISO();
    const note = noteIn.value.trim();
    const isOpen = openIn.checked;
    const e = {
      id: uid(), type: 'sale', date, amount: v.paid, listTotal: listTotal(),
      items: lines.map((l) => {
        const it = { pid: l.product.id, name: l.product.name, qty: l.qty, unit: l.unit, total: l.total, taken: 0 };
        if (l.free) { it.free = l.free; it.bonus = { per: l.product.bonus.per, free: l.product.bonus.free }; }
        return it;
      }),
      channel: v.channel, note, createdAt: Date.now(),
    };
    if (v.extra) e.items.push({ pid: null, name: 'Sonstiges', qty: 1, unit: v.extra, total: v.extra, taken: 0 });
    applyFee(e, v.feeRate);
    if (v.channel === 'messe') e.eventId = v.eventId;
    if (isOpen) e.status = 'open';
    const undo = commit((s) => {
      for (const it of e.items) it.taken = takeStock(s.products.find((x) => x.id === it.pid), it.qty + (it.free || 0));
      s.entries.push(e);
    });
    onDone && onDone(undo);
    undoToast(isOpen ? `Reserviert · ${money(v.paid)} offen` : `Verkauf gespeichert · ${money(v.paid - feeFor(v.paid, v.feeRate), { sign: true })}`, () => { undo(); onDone && onDone(null, lines); });
    return true;
  }
}

// ------------------------------------------------------------------
// Messe / Börse anlegen oder bearbeiten
// ------------------------------------------------------------------
export function openEventForm(event = null, { onSaved = null, simple = false } = {}) {
  const editing = !!event;
  const amounts = { rev: null, fee: null, travel: null };
  const LABELS = { rev: 'Einnahmen gesamt', fee: 'Standgebühr', travel: 'Fahrt & Sonstiges' };
  const sheet = openSheet({
    title: editing ? 'Messe bearbeiten' : 'Neue Messe',
    right: 'Speichern',
    dirty: () => !editing && (!!sheet.body.querySelector('[data-f="name"]').value.trim() || Object.values(amounts).some((x) => x != null)),
    content: `
      <div class="group">
        <label class="field"><span class="field-label">Name</span><input type="text" class="in" data-f="name" value="${esc(event?.name || '')}" placeholder="z. B. Zierfischbörse Hamm" maxlength="80" autocomplete="off"></label>
        <label class="field row-field"><span class="field-label">${icon('calendar')}Datum</span><input type="date" class="in" data-f="date" value="${esc(event?.date || todayISO())}"></label>
        <label class="field row-field"><span class="field-label">Ort</span><input type="text" class="in" data-f="place" value="${esc(event?.place || '')}" placeholder="optional" maxlength="80"></label>
      </div>
      ${!editing && !simple ? sec('Beträge direkt eintragen <span class="muted">(optional)</span>', `
        <div class="group">
          ${amountRow('rev', LABELS.rev, null, { placeholder: 'optional', ic: 'arrowDown' })}
          ${amountRow('fee', LABELS.fee, null, { placeholder: 'optional', ic: 'arrowUp' })}
          ${amountRow('travel', LABELS.travel, null, { placeholder: 'optional', ic: 'arrowUp' })}
        </div>
        <p class="hint">Einnahmen <strong>vor</strong> Abzug der Kosten eintragen – die Kosten werden extra als Ausgabe gebucht. Zählst du auf der Messe jeden Verkauf in der Kasse, lass „Einnahmen“ leer.</p>`) : ''}
      ${!editing ? `
      <div class="group">
        <label class="switch-row"><span><strong>Messe-Modus starten</strong><small>Verkäufe in der Kasse werden automatisch dieser Messe zugeordnet.</small></span>
          <input type="checkbox" class="switch" data-f="active" checked></label>
      </div>` : ''}`,
    onRight: () => save(),
  });
  const body = sheet.body;
  const dateIn = body.querySelector('[data-f="date"]');
  const activeIn = body.querySelector('[data-f="active"]');
  if (activeIn) dateIn.addEventListener('change', () => { activeIn.checked = dateIn.value === todayISO(); });
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-amt]');
    if (!a) return;
    const key = a.dataset.amt;
    openAmountPad({
      title: LABELS[key], initial: amounts[key], allowEmpty: true,
      onSet: (c) => { amounts[key] = c || null; setAmountRow(body, key, amounts[key], { placeholder: 'optional' }); },
    });
  });

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
    const { rev, fee, travel } = amounts;
    const ev = { id: uid(), name, date, place, createdAt: Date.now() };
    const now = Date.now();
    const undo = commit((s) => {
      s.events.push(ev);
      if (rev > 0) {
        const sale = { id: uid(), type: 'sale', amount: rev, date, channel: 'messe', eventId: ev.id, note: 'Tageseinnahmen', createdAt: now };
        applyFee(sale, s.settings.feeRate || 0);
        s.entries.push(sale);
      }
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
  openAmountPad({
    title: product.name, label: 'Menge', integer: true, initial: qty || null, allowEmpty: true, confirm: 'Übernehmen',
    hint: (n) => {
      if (!n) return '';
      const p = getProduct(product.id) || product;
      const free = freeFor(p.bonus, n);
      return `${money(unitPriceFor(p, n) * n)}${free ? ` · + ${free} gratis` : ''}${p.stock != null && n + free > p.stock ? ` · nur ${p.stock} im Bestand` : ''}`;
    },
    onSet: (n) => onSet(n || 0),
  });
}

export async function newEntryMenu() {
  const r = await actionSheet({
    actions: [
      { label: 'Verkauf mit Artikeln (Kasse)', value: 'kasse', icon: 'basket' },
      { label: 'Einnahme ohne Artikel', value: 'sale', icon: 'arrowDown' },
      { label: 'Ausgabe', value: 'expense', icon: 'arrowUp' },
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
