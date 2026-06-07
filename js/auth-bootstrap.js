/**
 * Unified Auth Bootstrap — Zwei-Phasen Authentifizierung
 *
 * Lädt SYNCHRON und blockiert den Browser sofort:
 * Phase 1 (sync): Token-Existenz-Check → ggf. sofort zu login.html
 * Phase 2 (async): Token-Refresh + Rollen-Validierung → richtige Seite per Rolle
 *
 * MUST: window.POCKETBASE_URL muss VOR diesem Script in der Seite gesetzt sein
 */

// ─ Persist logs to localStorage (for debugging redirects)
window._authBootstrapLogs = [];
function _logAuth(msg) {
  window._authBootstrapLogs.push(msg);
  localStorage.setItem('_authBootstrapLogs', JSON.stringify(window._authBootstrapLogs.slice(-20))); // keep last 20
  console.log('[auth-bootstrap]', msg);
}

// ─ PHASE 1: SYNC — Sofort Seite ausblenden + Token-Check
document.documentElement.style.visibility = 'hidden';
_logAuth('Page visibility hidden, starting auth bootstrap');

// PLAN-TRANSFER GUARD: Wenn Plan aktiv, blockiere admin.html Redirects KOMPLETT
const _planTransferActive = !!sessionStorage.getItem('crewplan_transfer_data');
if (_planTransferActive && window.location.pathname.includes('index.html')) {
  // Block location.replace
  const originalReplace = window.location.replace.bind(window.location);
  window.location.replace = function(url) {
    if (url === 'admin.html' || url.startsWith('admin.html')) {
      console.log('[GUARD] BLOCKED location.replace to admin.html');
      return;
    }
    originalReplace(url);
  };

  // Block location.href assignment
  Object.defineProperty(window.location, 'href', {
    set: function(url) {
      if (url.includes('admin.html')) {
        console.log('[GUARD] BLOCKED location.href to admin.html');
        return;
      }
      window.location.replace(url);
    },
    get: function() { return window.location.toString(); }
  });
}

(async function authBootstrapFlow() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const EXEMPT_PAGES = ['login.html', 'view.html'];
  const pbUrl = window.POCKETBASE_URL || 'http://localhost:8090';

  const token = localStorage.getItem('pb_token');
  const userStr = localStorage.getItem('pb_user');
  const skipRefresh = new URLSearchParams(window.location.search).has('noreauth');

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

  // ─ PHASE 2: Token vorhanden — Async Refresh + Rollen-Validierung (skip if ?noreauth=1)
  let data;
  try {
    if (skipRefresh) {
      // Token already valid, skip refresh but still use cached user data
      _logAuth('Token valid + noreauth=1 flag set, skipping refresh');
      data = JSON.parse(userStr);
    } else {
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

      data = await response.json();
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.record));
    }

    // ⚠️ FIX: skipRefresh-Pfad hat data=Record direkt, normaler Pfad hat data={token, record}
    const role = (skipRefresh ? data.role : data.record?.role) || 'crew';
    const isAdmin = role === 'superadmin' || role === 'manager';

    // ─ login.html mit gültigem Token → auto-redirect zur richtigen Seite
    if (currentPage === 'login.html') {
      const base = isAdmin ? 'admin.html' : 'index.html';
      const pending = localStorage.getItem('pendingEmailAction') || '';
      localStorage.removeItem('pendingEmailAction');
      window.location.replace(base + pending);
      return;
    }

    // ─ Plan-Transfer aktiv? Wenn ja, stay on index.html um Plan zu laden (skip role redirect)
    const hasPlanTransfer = !!sessionStorage.getItem('crewplan_transfer_data');

    // ─ Falsche Seite für diese Rolle → redirect (aber NICHT wenn Plan-Transfer aktiv)
    if (currentPage === 'admin.html' && !isAdmin) {
      // Crew/Booker auf admin.html → zu index.html
      window.location.replace('index.html');
      return;
    }
    if (currentPage === 'index.html' && isAdmin && !hasPlanTransfer && !skipRefresh) {
      // Manager/Superadmin auf index.html → zu admin.html (EXCEPT wenn Plan-Transfer oder ?noreauth=1)
      window.location.replace('admin.html');
      return;
    }

    // ─ Autorisiert für diese Seite → Seite zeigen + User bereitstellen
    window.BOOTSTRAP_CURRENT_USER = skipRefresh ? data : data.record;
    document.documentElement.style.visibility = '';

    // Dispatch event für Seiten die auf authReady warten (z.B. admin.html)
    window.dispatchEvent(new CustomEvent('authReady', {
      detail: skipRefresh ? data : data.record,
      bubbles: true
    }));

  } catch (e) {
    // Token-Refresh fehlgeschlagen → Token löschen
    _logAuth('ERROR: Token refresh failed: ' + (e.message || e));
    localStorage.removeItem('pb_token');
    localStorage.removeItem('pb_user');

    if (!EXEMPT_PAGES.includes(currentPage)) {
      // Zu login.html redirecten (außer auf exempt Seiten)
      _logAuth('Redirecting to login.html from ' + currentPage);
      window.location.replace('login.html');
    } else {
      // login.html / view.html → zeigen
      document.documentElement.style.visibility = '';
    }
  }
})();
