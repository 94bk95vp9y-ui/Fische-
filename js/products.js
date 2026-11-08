// Artikel anlegen/bearbeiten und KI-Import aus einer Anzeige.
import { store, commit, getProduct, productSold } from './store.js';
import { openSheet, toast, undoToast, confirmDanger, fileToSquareJpeg, pickFile, imgSrc, copyText, readClipboard } from './ui.js';
import { esc, money, uid, parseMoney, centsToInput, parseIntSafe, todayISO, fmtDate, isSafeUrl, normName } from './util.js';
import { PRODUCT_CATS, PRODUCT_CAT_KEYS, sortedTiers } from './model.js';
import { chips, bindChoice, thumb } from './components.js';
import { icon, CAT_GLYPH } from './icons.js';
import { AI_PROMPT, parseAiResponse } from './ai.js';

// ------------------------------------------------------------------
// Artikel-Editor
// ------------------------------------------------------------------
export function openProductEditor(id, { preset = null } = {}) {
  const orig = id ? getProduct(id) : null;
  const p = orig ? JSON.parse(JSON.stringify(orig)) : {
    id: uid(), name: '', category: 'fisch', price: null, tiers: [], stock: null, image: null,
    note: '', link: '', active: true, priceHistory: [], ...(preset || {}),
  };
  let dirty = false;
  const sold = orig ? productSold(orig.id) : null;

  const sheet = openSheet({
    title: orig ? 'Artikel bearbeiten' : 'Neuer Artikel',
    right: 'Sichern',
    dirty: () => dirty,
    content: `
      <div class="photo-row">
        <button type="button" class="photo" data-act="photo" aria-label="Foto wählen"></button>
        <div class="photo-actions">
          <button type="button" class="btn sm" data-act="photo">${icon('camera')}<span data-photo-label>Foto wählen</span></button>
          <button type="button" class="link small danger" data-act="photo-del" hidden>Foto entfernen</button>
          <p class="hint">Wird quadratisch zugeschnitten und nur auf diesem Gerät gespeichert.</p>
        </div>
      </div>
      <div class="group">
        <label class="field"><span class="field-label">Name</span><input type="text" class="in" data-f="name" value="${esc(p.name)}" placeholder="z. B. Red Cherry Garnele" maxlength="60" autocomplete="off"></label>
        <label class="field"><span class="field-label">Stückpreis (€)</span><input class="in big" data-f="price" inputmode="decimal" autocomplete="off" value="${esc(centsToInput(p.price))}" placeholder="0,00"></label>
      </div>
      <div class="sec-label">Kategorie</div>
      ${chips('cat', PRODUCT_CAT_KEYS.map((k) => ({ value: k, label: PRODUCT_CATS[k].label })), p.category)}

      <div class="sec-label">Mengenrabatt <span class="muted">(optional)</span></div>
      <div class="group" data-tiers></div>

      <div class="sec-label">Bestand <span class="muted">(optional)</span></div>
      <div class="group">
        <label class="switch-row"><span><strong>Bestand mitzählen</strong><small>Wird bei jedem Verkauf automatisch verringert.</small></span>
          <input type="checkbox" class="switch" data-f="track" ${p.stock != null ? 'checked' : ''}></label>
        <div class="field stock-field" data-stockwrap ${p.stock != null ? '' : 'hidden'}>
          <span class="field-label">Aktuell vorhanden</span>
          <span class="stepper">
            <button type="button" data-stock="-1" aria-label="weniger">${icon('minus')}</button>
            <input class="in num" data-f="stock" inputmode="numeric" value="${p.stock ?? 0}" aria-label="Bestand">
            <button type="button" data-stock="1" aria-label="mehr">${icon('plus')}</button>
          </span>
        </div>
      </div>

      <div class="group">
        <label class="switch-row"><span><strong>In der Kasse anzeigen</strong><small>Aus = archiviert, z. B. wenn gerade nichts da ist.</small></span>
          <input type="checkbox" class="switch" data-f="active" ${p.active ? 'checked' : ''}></label>
      </div>

      <div class="group">
        <label class="field"><span class="field-label">Link zur Anzeige</span><input type="url" class="in" data-f="link" value="${esc(p.link || '')}" placeholder="https://www.kleinanzeigen.de/…" autocomplete="off" autocapitalize="off"></label>
        <label class="field"><span class="field-label">Beschreibung / Notiz</span><textarea class="in" data-f="note" rows="3" maxlength="400" placeholder="optional">${esc(p.note || '')}</textarea></label>
      </div>
      ${p.link && isSafeUrl(p.link) ? `<a class="btn block" href="${esc(p.link)}" target="_blank" rel="noopener">${icon('external')}Anzeige öffnen</a>` : ''}

      ${orig ? `
      <div class="sec-label">Statistik</div>
      <div class="group">
        <div class="kv"><span>Verkauft</span><span>${sold.qty} Stück</span></div>
        <div class="kv"><span>Umsatz</span><span>${money(sold.revenue)}</span></div>
        ${(orig.priceHistory || []).slice(-5).reverse().map((h) => `<div class="kv"><span>Preis geändert ${esc(fmtDate(h.date))}</span><span>${money(h.from)} → ${money(h.to)}</span></div>`).join('')}
      </div>
      <p class="hint">Preisänderungen gelten nur für neue Verkäufe. Bisherige Verkäufe behalten den damaligen Preis.</p>
      <button type="button" class="btn danger block" data-act="delete">${icon('trash')}Artikel löschen</button>` : ''}`,
    onRight: () => save(),
  });
  const body = sheet.body;
  body.addEventListener('input', () => { dirty = true; });

  function renderPhoto() {
    const box = body.querySelector('.photo');
    box.innerHTML = p.image ? `<img src="${esc(imgSrc(p.image))}" alt="">` : `<span class="thumb glyph cat-${esc(p.category)}">${icon(CAT_GLYPH[p.category] || 'box')}</span>`;
    body.querySelector('[data-photo-label]').textContent = p.image ? 'Foto ändern' : 'Foto wählen';
    body.querySelector('[data-act="photo-del"]').hidden = !p.image;
  }
  function renderTiers() {
    const wrap = body.querySelector('[data-tiers]');
    wrap.innerHTML = p.tiers.map((t, i) => `
      <div class="tier" data-i="${i}">
        <span>ab</span><input class="in num" data-tier-min="${i}" inputmode="numeric" value="${t.min ?? ''}" placeholder="10" aria-label="ab Stück">
        <span>Stück je</span><input class="in num wide" data-tier-price="${i}" inputmode="decimal" value="${esc(centsToInput(t.price))}" placeholder="1,20" aria-label="Preis pro Stück">
        <span>€</span>
        <button type="button" class="icon-btn" data-tier-del="${i}" aria-label="entfernen">${icon('x')}</button>
      </div>`).join('') +
      `<button type="button" class="row add-row" data-act="tier-add">${icon('plus')}<span>${p.tiers.length ? 'Weitere Staffel' : 'Staffelpreis hinzufügen, z. B. „ab 10 Stück je 1,20 €“'}</span></button>`;
  }
  // Eingaben der Staffeln laufend übernehmen
  body.addEventListener('input', (e) => {
    const m = e.target.dataset.tierMin, pr = e.target.dataset.tierPrice;
    if (m !== undefined) p.tiers[+m].min = parseIntSafe(e.target.value);
    if (pr !== undefined) p.tiers[+pr].price = parseMoney(e.target.value);
  });
  renderPhoto();
  renderTiers();

  bindChoice(body, '[data-chips="cat"]', (v) => { p.category = v; dirty = true; if (!p.image) renderPhoto(); });

  const trackIn = body.querySelector('[data-f="track"]');
  trackIn.addEventListener('change', () => { body.querySelector('[data-stockwrap]').hidden = !trackIn.checked; });
  const stockIn = body.querySelector('[data-f="stock"]');

  body.addEventListener('click', async (e) => {
    const st = e.target.closest('[data-stock]');
    if (st) { stockIn.value = Math.max(0, (parseIntSafe(stockIn.value) || 0) + +st.dataset.stock); dirty = true; return; }
    const td = e.target.closest('[data-tier-del]');
    if (td) { p.tiers.splice(+td.dataset.tierDel, 1); dirty = true; renderTiers(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'tier-add') {
      const last = p.tiers[p.tiers.length - 1];
      p.tiers.push({ min: last && last.min ? last.min * 2 : 10, price: null });
      dirty = true;
      renderTiers();
      const inp = body.querySelector(`[data-tier-price="${p.tiers.length - 1}"]`);
      inp && inp.focus();
    }
    if (a.dataset.act === 'photo') {
      const file = await pickFile('image/*');
      if (!file) return;
      try { p.image = await fileToSquareJpeg(file); dirty = true; renderPhoto(); }
      catch { toast('Das Foto konnte nicht geladen werden'); }
    }
    if (a.dataset.act === 'photo-del') { p.image = null; dirty = true; renderPhoto(); }
    if (a.dataset.act === 'delete') {
      const ok = await confirmDanger('Bisherige Verkäufe und Statistiken bleiben erhalten.', 'Artikel löschen', `„${orig.name}“ löschen?`);
      if (!ok) return;
      sheet.close();
      const undo = commit((s) => { s.products = s.products.filter((x) => x.id !== orig.id); });
      undoToast('Artikel gelöscht', undo);
    }
  });

  function save() {
    const name = body.querySelector('[data-f="name"]').value.trim();
    const priceRaw = body.querySelector('[data-f="price"]').value;
    const price = parseMoney(priceRaw);
    if (!name) { toast('Bitte einen Namen eingeben'); body.querySelector('[data-f="name"]').focus(); return false; }
    if (price === null || price < 0) { toast('Bitte einen gültigen Stückpreis eingeben'); body.querySelector('[data-f="price"]').focus(); return false; }
    const tiers = [];
    for (const t of p.tiers) {
      if (t.min == null && t.price == null) continue;
      if (!t.min || t.min < 2 || t.price == null || t.price < 0) { toast('Mengenrabatt unvollständig: „ab“ mindestens 2 Stück und ein Preis'); return false; }
      if (!tiers.some((x) => x.min === t.min)) tiers.push({ min: t.min, price: t.price });
    }
    const link = body.querySelector('[data-f="link"]').value.trim();
    if (link && !isSafeUrl(link)) { toast('Der Link muss mit https:// beginnen'); return false; }
    const data = {
      name, price,
      category: p.category,
      tiers: sortedTiers(tiers),
      stock: trackIn.checked ? Math.max(0, parseIntSafe(stockIn.value) || 0) : null,
      image: p.image,
      active: body.querySelector('[data-f="active"]').checked,
      link,
      note: body.querySelector('[data-f="note"]').value.trim(),
      updatedAt: Date.now(),
    };
    if (orig) {
      const undo = commit((s) => {
        const x = s.products.find((y) => y.id === orig.id);
        if (!x) return;
        if (x.price !== price) x.priceHistory = [...(x.priceHistory || []), { date: todayISO(), from: x.price, to: price }].slice(-20);
        Object.assign(x, data);
      });
      undoToast(orig.price !== price ? `Preis geändert · ${money(price)}` : 'Artikel gespeichert', undo);
    } else {
      const undo = commit((s) => {
        const order = s.products.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1;
        s.products.push({ id: p.id, ...data, priceHistory: [], order, createdAt: Date.now() });
      });
      undoToast('Artikel angelegt', undo);
    }
    return true;
  }
}

// ------------------------------------------------------------------
// KI-Import
// ------------------------------------------------------------------
export function openAiImport() {
  let parsed = [];
  const sheet = openSheet({
    title: 'Aus Anzeige',
    right: 'Übernehmen',
    dirty: () => parsed.length > 0,
    content: `
      <ol class="steps">
        <li>
          <strong>Prompt kopieren</strong>
          <button type="button" class="btn primary block" data-act="copy">${icon('copy')}<span data-copy-label>Prompt kopieren</span></button>
          <details class="prompt-preview"><summary>Prompt ansehen</summary><pre>${esc(AI_PROMPT)}</pre></details>
        </li>
        <li>
          <strong>In eine KI einfügen</strong>
          <span>ChatGPT, Claude, Gemini o. Ä. öffnen, Prompt einfügen und <em>Screenshots deiner Anzeige</em> (Titel, Preis, Beschreibung) anhängen – oder den Anzeigentext dahinter kopieren. Absenden.</span>
        </li>
        <li>
          <strong>Antwort hier einfügen</strong>
          <span>Die komplette Antwort der KI kopieren (bei ChatGPT: „Code kopieren“ am Codeblock).</span>
          <textarea class="in mono" data-f="answer" rows="6" placeholder='{ "app": "fischkasse", "artikel": [ … ] }' autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
          <div class="btn-row">
            <button type="button" class="btn" data-act="paste">${icon('paste')}Einfügen</button>
            <button type="button" class="btn primary" data-act="check">Prüfen</button>
          </div>
        </li>
      </ol>
      <div data-result></div>`,
    onRight: () => doImport(),
  });
  sheet.setRight('Übernehmen', false);
  const body = sheet.body;
  const ta = body.querySelector('[data-f="answer"]');

  function check() {
    const res = parseAiResponse(ta.value);
    const out = body.querySelector('[data-result]');
    if (res.error) {
      parsed = [];
      out.innerHTML = `<div class="banner warn">${icon('alert')}<span>${esc(res.error)}</span></div>`;
      sheet.setRight('Übernehmen', false);
      return;
    }
    const byName = new Map(store.state.products.map((x) => [normName(x.name), x]));
    parsed = res.items.map((it) => ({ ...it, include: true, match: byName.get(normName(it.name)) || null }));
    renderResult();
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderResult() {
    const out = body.querySelector('[data-result]');
    out.innerHTML = `<div class="sec-label">${parsed.length} ${parsed.length === 1 ? 'Artikel' : 'Artikel'} erkannt – bitte prüfen</div>
      ${parsed.map((it, i) => `
        <div class="group import-item ${it.include ? '' : 'off'}">
          <label class="switch-row tight"><span><strong>${it.match ? 'Vorhandenen Artikel aktualisieren' : 'Neuer Artikel'}</strong>
            <small>${esc((PRODUCT_CATS[it.category] || PRODUCT_CATS.sonstiges).label)}${it.stock != null ? ` · Bestand ${it.stock}` : ''}${it.tiers.length ? ` · ${it.tiers.map((t) => `ab ${t.min}: ${money(t.price)}`).join(', ')}` : ''}</small></span>
            <input type="checkbox" class="switch" data-inc="${i}" ${it.include ? 'checked' : ''}></label>
          <label class="field"><span class="field-label">Name</span><input class="in" data-iname="${i}" value="${esc(it.name)}" maxlength="60"></label>
          <label class="field"><span class="field-label">Stückpreis (€)${it.match && it.match.price !== it.price ? ` <span class="muted">bisher ${money(it.match.price)}</span>` : ''}</span>
            <input class="in" data-iprice="${i}" inputmode="decimal" value="${esc(centsToInput(it.price))}" placeholder="Preis fehlt – bitte eintragen"></label>
          ${it.note ? `<p class="field-note">${esc(it.note)}</p>` : ''}
        </div>`).join('')}
      <p class="hint">Fotos kann die KI nicht übertragen – die fügst du danach im Artikel hinzu.</p>`;
    sheet.setRight('Übernehmen', parsed.some((x) => x.include));
  }
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.iname !== undefined) parsed[+t.dataset.iname].name = t.value;
    if (t.dataset.iprice !== undefined) parsed[+t.dataset.iprice].price = parseMoney(t.value);
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.inc !== undefined) {
      parsed[+t.dataset.inc].include = t.checked;
      t.closest('.import-item').classList.toggle('off', !t.checked);
      sheet.setRight('Übernehmen', parsed.some((x) => x.include));
    }
  });
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'copy') {
      const ok = await copyText(AI_PROMPT);
      const l = body.querySelector('[data-copy-label]');
      l.textContent = ok ? 'Kopiert – jetzt in die KI einfügen' : 'Kopieren nicht möglich – Prompt unten markieren';
      if (!ok) body.querySelector('.prompt-preview').open = true;
      setTimeout(() => { l.textContent = 'Prompt kopieren'; }, 3500);
    }
    if (a.dataset.act === 'paste') {
      const txt = await readClipboard();
      if (txt) { ta.value = txt; check(); }
      else { ta.focus(); toast('Tippe ins Feld und wähle „Einsetzen“'); }
    }
    if (a.dataset.act === 'check') check();
  });

  function doImport() {
    const chosen = parsed.filter((x) => x.include);
    for (const it of chosen) {
      if (!it.name || !it.name.trim()) { toast('Ein Artikel hat keinen Namen'); return false; }
      if (it.price === null || it.price < 0) { toast(`Preis fehlt bei „${it.name}“`); return false; }
    }
    let created = 0, updated = 0;
    const undo = commit((s) => {
      let order = s.products.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1;
      for (const it of chosen) {
        const ex = it.match && s.products.find((x) => x.id === it.match.id);
        if (ex) {
          if (ex.price !== it.price) ex.priceHistory = [...(ex.priceHistory || []), { date: todayISO(), from: ex.price, to: it.price }].slice(-20);
          ex.price = it.price;
          ex.name = it.name.trim();
          if (it.tiers.length) ex.tiers = it.tiers;
          if (it.link && !ex.link) ex.link = it.link;
          if (it.note && !ex.note) ex.note = it.note;
          if (ex.stock == null && it.stock != null) ex.stock = it.stock;
          ex.active = true;
          ex.updatedAt = Date.now();
          updated++;
        } else {
          s.products.push({
            id: uid(), name: it.name.trim(), category: it.category, price: it.price, tiers: it.tiers,
            stock: it.stock, image: null, note: it.note || '', link: it.link || '', active: true,
            priceHistory: [], order: order++, createdAt: Date.now(),
          });
          created++;
        }
      }
    });
    const parts = [];
    if (created) parts.push(`${created} neu`);
    if (updated) parts.push(`${updated} aktualisiert`);
    undoToast(`Übernommen: ${parts.join(', ')}`, undo);
    return true;
  }
}

export function productThumb(p) { return thumb(p); }
