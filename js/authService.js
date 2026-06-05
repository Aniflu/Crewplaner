import { SUPABASE_ENABLED } from './config.js';
import { setAuthState, IS_MANAGER, IS_CREW, CURRENT_USER_EMAIL } from './state.js';
import { pbPost, pbGet, pbPatch } from './pb.js';
import { loadPlanForCrew, loadPlanForManager, loadCrewMeta, loadAssignmentStatuses } from './dataService.js';
import { renderTable } from './render.js';
import { showToast } from './utils.js';
import { getActivePlanId } from './plans.js';

// ── Auth Service (Pocketbase) ──────────────────────────────────────────────────
window.__authGuarded = SUPABASE_ENABLED;

export async function _authCheckAndStart() {
  try {
    const token   = localStorage.getItem('pb_token');
    const userStr = localStorage.getItem('pb_user');

    if (!token || !userStr) {
      if (window.location.search) localStorage.setItem('pendingEmailAction', window.location.search);
      window.location.href = 'login.html';
      return;
    }

    // Token beim Server erneuern (validiert + gibt frisches Token)
    let user;
    try {
      const data = await pbPost('/api/collections/users/auth-refresh');
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.record));
      user = data.record;
    } catch (e) {
      // Token abgelaufen oder ungültig
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_user');
      if (window.location.search) localStorage.setItem('pendingEmailAction', window.location.search);
      window.location.href = 'login.html';
      return;
    }

    setAuthState(user.id, user.email, user.role || 'crew');
    _showUserBadge(user);
    // Page visibility handled by auth-bootstrap.js

    // Plan-Transfer von admin.html via sessionStorage anwenden (vor startApp)
    const _transferData = sessionStorage.getItem('crewplan_transfer_data');
    if (_transferData && IS_MANAGER) {
      try {
        const _td = JSON.parse(_transferData);
        const _tn = sessionStorage.getItem('crewplan_transfer_name') || 'Plan';
        const _tp = sessionStorage.getItem('crewplan_transfer_pbid') || '';
        console.log('[auth] Plan-Transfer: name=' + _tn + ' pbid=' + _tp + ' tourDates=' + (_td.tourDates?.length || 0));
        sessionStorage.removeItem('crewplan_transfer_data');
        sessionStorage.removeItem('crewplan_transfer_name');
        sessionStorage.removeItem('crewplan_transfer_pbid');
        const _tid = 'p' + Date.now().toString(36);
        localStorage.setItem('tourplan_plan_' + _tid, _transferData);
        if (_tp) { localStorage.setItem('tourplan_pb_' + _tid, _tp); localStorage.setItem('tourplan_active_pb_id', _tp); }
        const _today = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit'});
        localStorage.setItem('tourplan_plans', JSON.stringify([{id:_tid, name:_tn, created:_today, modified:_today}]));
        localStorage.setItem('tourplan_active_plan', _tid);
        console.log('[auth] Plan in localStorage gesetzt: tourplan_plan_' + _tid);
      } catch(e) { console.warn('[auth] Plan-Transfer Fehler:', e); }
    }

    // Call startApp — defined in init.js which is imported after this module
    if (typeof window.startApp === 'function') {
      window.startApp();
    } else {
      console.warn('[auth] startApp not yet defined');
    }

    // Für Manager: Plan aus PB laden wenn kein echter PB-verknüpfter Plan in localStorage liegt
    const activePlanId = getActivePlanId();
    const pbPlanCached = activePlanId && !!localStorage.getItem('tourplan_pb_' + activePlanId);
    const loadAll = IS_CREW
      ? loadPlanForCrew().then(() => Promise.all([loadCrewMeta(), loadAssignmentStatuses()]))
      : (pbPlanCached ? Promise.resolve() : loadPlanForManager())
          .then(() => Promise.all([loadCrewMeta(), loadAssignmentStatuses()]));

    loadAll
      .then(() => {
        renderTable();
        if (typeof checkAndOpenMySchedule === 'function') checkAndOpenMySchedule();
        _handleEmailAction();
        _checkPendingAction();
      })
      .catch(e => {
        console.error('Lade-Fehler:', e);
        renderTable();
      });
  } catch (e) {
    console.error('Auth-Fehler:', e);
    window.location.href = 'login.html';
  }
}

function _showUserBadge(user) {
  const el = document.getElementById('userBadge');
  if (!el) return;
  el.style.display = 'flex';
  const emailEl = el.querySelector('.user-email');
  if (emailEl) emailEl.textContent = user.email;
  const btnKonsole = document.getElementById('btnKonsole');
  if (btnKonsole) btnKonsole.style.display = IS_MANAGER ? '' : 'none';
  document.querySelectorAll('.manager-only').forEach(el => el.style.display = IS_MANAGER ? '' : 'none');
  document.querySelectorAll('.crew-only').forEach(el => el.style.display = IS_CREW ? '' : 'none');
}

export async function logout() {
  localStorage.removeItem('pb_token');
  localStorage.removeItem('pb_user');
  window.location.href = 'login.html';
}

export async function _handleEmailAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const aid    = params.get('aid');
  if (!action || !aid || !SUPABASE_ENABLED) return;
  history.replaceState({}, '', window.location.pathname);
  try {
    const record = await pbGet('/api/collections/assignments/records/' + aid);
    if (!record || (record.crew_email || '').toLowerCase() !== (CURRENT_USER_EMAIL || '').toLowerCase()) {
      showToast('Zugriff verweigert', '#e84a4a');
      return;
    }
    const payload = { responded_at: new Date().toISOString() };
    if (action === 'confirm') {
      payload.status = 'confirmed';
      await pbPatch('/api/collections/assignments/records/' + aid, payload);
      showToast('Einsatz bestätigt ✓', '#4ae8a0');
    } else if (action === 'decline') {
      payload.status = 'declined';
      await pbPatch('/api/collections/assignments/records/' + aid, payload);
      showToast('Einsatz abgelehnt', '#e84a4a');
    } else { return; }
    await loadAssignmentStatuses();
    renderTable();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
}

// _checkPendingAction is defined in init.js — placeholder for Phase 2
export function _checkPendingAction() {
  // Will be overridden/called from init.js after it's migrated
}
