/**
 * Unified Auth Bootstrap — Zwei-Phasen Authentifizierung
 *
 * Lädt SYNCHRON und blockiert den Browser sofort:
 * Phase 1 (sync): Token-Existenz-Check → ggf. sofort zu login.html
 * Phase 2 (async): Token-Refresh + Rollen-Validierung → richtige Seite per Rolle
 *
 * MUST: window.POCKETBASE_URL muss VOR diesem Script in der Seite gesetzt sein
 */

// ─ PHASE 1: SYNC — Sofort Seite ausblenden + Token-Check
document.documentElement.style.visibility = 'hidden';

(async function authBootstrapFlow() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const EXEMPT_PAGES = ['login.html', 'view.html'];
  const pbUrl = window.POCKETBASE_URL || 'http://localhost:8090';

  const token = localStorage.getItem('pb_token');
  const userStr = localStorage.getItem('pb_user');

  // ─ Kein Token vorhanden
  if (!token || !userStr) {
    if (!EXEMPT_PAGES.includes(currentPage)) {
      // Alle anderen Seiten: redirect zu login.html
      window.location.replace('login.html');
      return;
    }
    // login.html / view.html ohne Token → Seite zeigen
    document.documentElement.style.visibility = '';
    return;
  }

  // ─ PHASE 2: Token vorhanden — Async Refresh + Rollen-Validierung
  try {
    // Token erneuern
    const response = await fetch(pbUrl + '/api/collections/users/auth-refresh', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Token refresh failed: ' + response.status);
    }

    const data = await response.json();
    localStorage.setItem('pb_token', data.token);
    localStorage.setItem('pb_user', JSON.stringify(data.record));

    const role = data.record.role || 'crew';
    const isAdmin = role === 'superadmin' || role === 'manager';

    // ─ login.html mit gültigem Token → auto-redirect zur richtigen Seite
    if (currentPage === 'login.html') {
      const base = isAdmin ? 'admin.html' : 'index.html';
      const pending = localStorage.getItem('pendingEmailAction') || '';
      localStorage.removeItem('pendingEmailAction');
      window.location.replace(base + pending);
      return;
    }

    // ─ Falsche Seite für diese Rolle → redirect
    if (currentPage === 'admin.html' && !isAdmin) {
      // Crew/Booker auf admin.html → zu index.html
      window.location.replace('index.html');
      return;
    }
    if (currentPage === 'index.html' && isAdmin) {
      // Manager/Superadmin auf index.html → zu admin.html
      window.location.replace('admin.html');
      return;
    }

    // ─ Autorisiert für diese Seite → Seite zeigen + User bereitstellen
    window.BOOTSTRAP_CURRENT_USER = data.record;
    document.documentElement.style.visibility = '';

    // Dispatch event für Seiten die auf authReady warten (z.B. admin.html)
    window.dispatchEvent(new CustomEvent('authReady', {
      detail: data.record,
      bubbles: true
    }));

  } catch (e) {
    // Token-Refresh fehlgeschlagen → Token löschen
    console.error('[auth-bootstrap] Token refresh failed:', e.message || e);
    localStorage.removeItem('pb_token');
    localStorage.removeItem('pb_user');

    if (!EXEMPT_PAGES.includes(currentPage)) {
      // Zu login.html redirecten (außer auf exempt Seiten)
      console.warn('[auth-bootstrap] Redirecting to login.html from', currentPage);
      window.location.replace('login.html');
    } else {
      // login.html / view.html → zeigen
      document.documentElement.style.visibility = '';
    }
  }
})();
