// ── Modal Utilities ────────────────────────────────────────────────────────────

export function openModal(id){
  document.getElementById(id).classList.add('open');
  // Body-Scroll-Lock: verhindert, dass der (am Handy lange, scrollbare) Hintergrund
  // hinter dem fixed-Overlay mitscrollt und die Box aus dem Sichtfeld schiebt (v0.26.1).
  document.body.classList.add('modal-open');
}

export function closeModal(id){
  document.getElementById(id).classList.remove('open');
  // Lock nur lösen, wenn KEIN weiteres Modal mehr offen ist (gestapelte Modals wie
  // crewImportModal über crewModal).
  if(!document.querySelector('.modal-bg.open')) document.body.classList.remove('modal-open');
}

// Klick auf den Hintergrund schließt diese Modals.
//
// ⚠️ `el` MUSS geprüft werden: modals.js wird von allen Oberflächen geladen, aber nicht jede
// hat alle drei Modals. admin.html kennt weder sharedModal noch logoModal, view.html keines —
// dort warf dieser Listener bei JEDEM Klick „Cannot read properties of null" und brach ab,
// bevor die übrigen IDs geprüft wurden (gefunden mit tools/dialog-harness.mjs, v0.9.1).
document.addEventListener('click',e=>{
  ['sharedModal','pdfModal','logoModal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.classList.contains('open')&&e.target===el)closeModal(id);
  });
});

// ── Shared Modal (Rename / Add Position) ──────────────────────────────────────
export function openSharedModal(title,currentVal,onConfirm){
  document.getElementById('sharedTitle').textContent=title;
  document.getElementById('sharedBody').innerHTML=`
    <div class="mf"><label class="ml">Bezeichnung</label><input type="text" id="sharedInput" class="mi" value="${currentVal}"></div>
    <div class="mactions"><button class="mbtn" onclick="closeModal('sharedModal')">Abbrechen</button><button class="mbtn primary" onclick="window._confirmShared()">Speichern</button></div>`;
  window._confirmShared=()=>{const v=document.getElementById('sharedInput')?.value.trim();if(!v)return;closeModal('sharedModal');onConfirm(v);};
  openModal('sharedModal');setTimeout(()=>document.getElementById('sharedInput')?.focus(),50);
}
