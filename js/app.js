// Entry point for index.html
import { SUPABASE_ENABLED } from './config.js';
import { _authCheckAndStart } from './authService.js';

// Import all modules to ensure they are loaded and registered
import './state.js';
import './pb.js';
import './utils.js';
import './rbac.js';
import './types.js';
import './render.js';
import './tourblock.js';
import './stats.js';
import './sidebar.js';
import './blockview.js';
import './crewview.js';
import './dropdown.js';
import './crew.js';
import './positions.js';
import './modals.js';
import './dates.js';
import './logos.js';
import './calendar.js';
import './plans.js';
import './persistence.js';
import './crewNotify.js';
import './crewLink.js';
import './userView.js';
import './dialog.js';
import './init.js';

// ── Security: Redirect to login if not authenticated ──────────────────────
if (!localStorage.getItem('pb_token')) {
  if (!window.location.pathname.includes('login') && !window.location.pathname.includes('view')) {
    window.location.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[app.js] DOMContentLoaded fired. SUPABASE_ENABLED:', SUPABASE_ENABLED);
  if (!SUPABASE_ENABLED) {
    console.warn('[app.js] SUPABASE_ENABLED=false, skipping auth check');
    return;
  }
  if (window.location.pathname.includes('login')) {
    console.log('[app.js] On login page, skipping auth check');
    return;
  }
  console.log('[app.js] Starting auth check...');
  document.body.style.visibility = 'hidden';
  _authCheckAndStart().catch(e => {
    console.error('[app.js] Auth check failed:', e);
    window.location.href = 'login.html';
  });
});
