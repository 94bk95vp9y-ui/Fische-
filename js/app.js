// Einstieg: Daten laden, Navigation, Tab-Leiste, Service Worker.
import { load, subscribe, store } from './store.js';
import { icon } from './icons.js';
import { currentPath, go, resetDepth } from './nav.js';
import { toast, isLocked } from './ui.js';
import { homeView } from './views/home.js';
import { kasseView, cartCount } from './views/kasse.js';
import { verlaufView } from './views/verlauf.js';
import { artikelView } from './views/artikel.js';
import { mehrView } from './views/mehr.js';
import { statsView, monthView } from './views/stats.js';
import { messenView, messeView } from './views/messen.js';

const TABS = [
  { id: 'home', path: '', label: 'Übersicht', icon: 'home' },
  { id: 'kasse', path: 'kasse', label: 'Kasse', icon: 'basket' },
  { id: 'verlauf', path: 'verlauf', label: 'Verlauf', icon: 'list' },
  { id: 'artikel', path: 'artikel', label: 'Artikel', icon: 'fish' },
  { id: 'mehr', path: 'mehr', label: 'Mehr', icon: 'more' },
];

const ROUTES = [
  { re: /^$/, view: homeView, tab: 'home' },
  { re: /^kasse$/, view: kasseView, tab: 'kasse' },
  { re: /^verlauf$/, view: verlaufView, tab: 'verlauf' },
  { re: /^artikel$/, view: artikelView, tab: 'artikel' },
  { re: /^mehr$/, view: mehrView, tab: 'mehr' },
  { re: /^statistik(?:\/(\d{4}))?$/, view: statsView, tab: 'home', sub: true },
  { re: /^monat\/(\d{4}-\d{2})$/, view: monthView, tab: 'home', sub: true },
  { re: /^messen$/, view: messenView, tab: 'mehr', sub: true },
  { re: /^messe\/([\w-]+)$/, view: messeView, tab: 'mehr', sub: true },
];

const viewRoot = document.getElementById('view');
const scrollMemo = new Map();
let current = null; // { path, route, ctrl, page }

function setBadge(n) {
  const b = document.querySelector('.tab[data-tab="kasse"] .tab-badge');
  if (!b) return;
  b.textContent = n > 99 ? '99+' : String(n);
  b.hidden = !n;
}

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map((t) => `
    <button type="button" class="tab" data-tab="${t.id}" aria-label="${t.label}">
      <span class="tab-ic">${icon(t.icon)}${t.id === 'kasse' ? '<span class="tab-badge" hidden></span>' : ''}</span>
      <span class="tab-label">${t.label}</span>
    </button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    const t = TABS.find((x) => x.id === b.dataset.tab);
    if (current && current.path === t.path) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    resetDepth();
    go(t.path, { replace: true });
  });
}

function route() {
  const path = currentPath();
  let match = null, route = null;
  for (const r of ROUTES) { const m = path.match(r.re); if (m) { match = m; route = r; break; } }
  if (!route) { go('', { replace: true }); return; }
  if (current) scrollMemo.set(current.path, window.scrollY);

  const page = document.createElement('div');
  page.className = 'page' + (route.sub ? ' sub' : '');
  const ctrl = route.view(page, match.slice(1).filter((x) => x !== undefined), { onCartChange: setBadge });
  current = { path, route, ctrl, page };
  ctrl.render();
  viewRoot.replaceChildren(page);
  document.body.dataset.tab = route.tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === route.tab));
  const y = route.sub ? 0 : scrollMemo.get(path) || 0;
  window.scrollTo(0, y);
  onScroll();
}

function rerender() {
  if (!current) return;
  const y = window.scrollY;
  current.ctrl.render();
  // Höhe kann sich ändern; Scrollposition beibehalten
  if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
}

// Kompakten Titel in Unterseiten einblenden, sobald der große Titel weggescrollt ist
function onScroll() {
  if (isLocked()) return; // Hintergrund ist fixiert, scrollY ist dann 0
  document.body.classList.toggle('scrolled', window.scrollY > 44);
}

// iOS: Die Tastatur verdeckt den unteren Bereich. Offene Fenster werden unten gekürzt,
// ihr oberer Rand bleibt aber stehen – so springt beim Antippen nichts hin und her.
function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let last = -1;
  const update = () => {
    // Beim Hineinzoomen (Pinch) nicht als Tastatur missverstehen
    const kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    if (kb === last) return;
    last = kb;
    root.style.setProperty('--kb', kb + 'px');
    root.classList.toggle('kb-open', kb > 120);
  };
  vv.addEventListener('resize', update);
  update();
}

async function start() {
  trackKeyboard();
  renderTabbar();
  try {
    await load();
  } catch (e) {
    console.error(e);
    toast('Daten konnten nicht geladen werden');
  }
  setBadge(cartCount());
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', onScroll, { passive: true });
  subscribe(() => { rerender(); setBadge(cartCount()); });
  route();
  document.documentElement.classList.add('ready');
  if (store.storage !== 'idb') toast('Hinweis: Eingeschränkter Speicher – bitte regelmäßig Backups machen');
}

start();

// Offline-Fähigkeit
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Neue Version geladen', { action: { label: 'Neu starten', onClick: () => location.reload() }, duration: 10000 });
          }
        });
      });
    }).catch(() => {});
  });
}
