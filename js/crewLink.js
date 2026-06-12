// ── Crew ↔ E-Mail Verknüpfung (nur Admin) ─────────────────────────────────────
import { IS_MANAGER, crew, crewMeta, CREW_COLORS } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { pbGet, pbPatch } from './pb.js';
import { showToast } from './utils.js';
import { closeModal, openModal } from './modals.js';
import { hasPermission } from './rbac.js';
import { saveCrewLink } from './dataService.js';

export function openCrewLinkModal() {
  if (!hasPermission('linkCrewEmail')) return;
  document.getElementById('sharedTitle').textContent = 'Crew verknüpfen';
  _renderCrewLinkList();
  openModal('sharedModal');
}

function _renderCrewLinkList() {
  const rows = crew.map((name, i) => {
    const meta = crewMeta[name] || {};
    const dot = CREW_COLORS[i % CREW_COLORS.length];
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
      <span style="min-width:120px;font-size:.65rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${name}</span>
      <input type="email" id="cl_${i}" class="mi" placeholder="E-Mail…"
             value="${meta.email || ''}"
             style="flex:2;font-size:.62rem;padding:4px 8px;"
             onkeydown="if(event.key==='Enter')saveCrewLinkRow(${i})">
      <button class="mbtn primary sm" onclick="saveCrewLinkRow(${i})" style="font-size:.6rem;padding:3px 8px;flex-shrink:0;">✓</button>
    </div>`;
  }).join('');

  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.6rem;color:var(--muted);margin-bottom:12px;line-height:1.5;">
      E-Mail-Adresse eingeben → Crew-Mitglied bekommt eine Benachrichtigung wenn du sie vorschlägst.
    </div>
    ${rows}
    <div class="mactions" style="margin-top:8px;">
      <button class="mbtn" onclick="closeModal('sharedModal')">Schließen</button>
    </div>`;
}

export async function saveCrewLinkRow(i) {
  const name = crew[i];
  const email = (document.getElementById('cl_' + i)?.value || '').trim().toLowerCase();
  if (!email) return;
  try {
    await saveCrewLink(name, email);
    showToast(`${name} verknüpft ✓`, '#4ae8a0');
    _renderCrewLinkList();
  } catch (e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
}
