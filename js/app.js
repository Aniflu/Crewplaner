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

document.addEventListener('DOMContentLoaded', () => {
  if (!SUPABASE_ENABLED) return;
  if (window.location.pathname.includes('login')) return;
  document.body.style.visibility = 'hidden';
  _authCheckAndStart();
});
