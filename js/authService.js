// ── Auth Service (Pocketbase) ──────────────────────────────────────────────────
window.__authGuarded = SUPABASE_ENABLED;

async function _authCheckAndStart() {
  try {
    const token   = localStorage.getItem('pb_token');
    const userStr = localStorage.getItem('pb_user');

    if (!token || !userStr) {
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
      window.location.href = 'login.html';
      return;
    }

    CURRENT_USER_ID    = user.id;
    CURRENT_USER_EMAIL = user.email;
    IS_ADMIN           = user.email === ADMIN_EMAIL;
    _showUserBadge(user);
    document.body.style.visibility = 'visible';
    startApp();

    Promise.all([loadCrewMeta(), loadAssignmentStatuses()]).then(() => {
      renderTable();
      if (typeof checkAndOpenMySchedule === 'function') checkAndOpenMySchedule();
    });
  } catch (e) {
    console.error('Auth-Fehler:', e);
    document.body.style.visibility = 'visible';
    startApp();
  }
}

function _showUserBadge(user) {
  const el = document.getElementById('userBadge');
  if (!el) return;
  el.style.display = 'flex';
  const emailEl = el.querySelector('.user-email');
  if (emailEl) emailEl.textContent = user.email;
  const btnCL = document.getElementById('btnCrewLink');
  if (btnCL && user.email === ADMIN_EMAIL) btnCL.style.display = '';
  const btnCN = document.getElementById('btnCrewNotify');
  if (btnCN && user.email === ADMIN_EMAIL) btnCN.style.display = '';
}

async function logout() {
  localStorage.removeItem('pb_token');
  localStorage.removeItem('pb_user');
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  if (!SUPABASE_ENABLED) return;
  // Nicht auf login.html ausführen!
  if (window.location.pathname.includes('login')) return;
  document.body.style.visibility = 'hidden';
  _authCheckAndStart();
});
