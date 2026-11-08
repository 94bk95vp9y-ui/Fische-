// Einfache Hash-Navigation (#/kasse, #/monat/2026-11, …)
let depth = 0;

export function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#\/?/, ''));
}

export function go(path, { replace = false } = {}) {
  const target = '#/' + path;
  if (location.hash === target) return;
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = target;
  }
}

/** Zurück innerhalb der App; ohne Verlauf (z. B. direkt geöffnet) zur übergeordneten Seite. */
export function back(fallback = '') {
  if (depth > 0) { depth--; history.back(); }
  else go(fallback, { replace: true });
}

export function resetDepth() { depth = 0; }
