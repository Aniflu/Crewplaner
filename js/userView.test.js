// Unit Tests für Update-Queue Modal (v0.9.11.5 Critical Fixes)
// Ausführung: In Browser-Console oder mit Jest/Vitest
// HINWEIS: Diese Tests erfordern ein Test-Runner-Setup

// Test Helper: Simple Assertion Framework
const assert = {
  equal: (actual, expected, msg) => {
    if (actual !== expected) throw new Error(`FAIL: ${msg}\nExpected: ${expected}, Got: ${actual}`);
    console.log(`✓ ${msg}`);
  },
  deepEqual: (actual, expected, msg) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`FAIL: ${msg}\nExpected: ${JSON.stringify(expected)}\nGot: ${JSON.stringify(actual)}`);
    }
    console.log(`✓ ${msg}`);
  },
  ok: (condition, msg) => {
    if (!condition) throw new Error(`FAIL: ${msg}`);
    console.log(`✓ ${msg}`);
  },
  throws: (fn, msg) => {
    try {
      fn();
      throw new Error(`FAIL: ${msg} (expected exception)`);
    } catch(e) {
      console.log(`✓ ${msg}`);
    }
  }
};

// =============================================================================
// TEST SUITE: UpdateQueueModal
// =============================================================================

describe('UpdateQueueModal - SlotKey Fix (Index Race Condition)', () => {

  test('Bug Fix 1: _deleteSlotFromQueue mit slotKey statt Index', () => {
    // Setup
    const queue = {
      'Thomas': {
        email: 'thomas@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true },
          { date: '2026-07-28', posLabel: 'Soundcheck', selected: true },
          { date: '2026-07-29', posLabel: 'Setup', selected: true }
        ]
      }
    };

    // Speichern in localStorage
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(queue));

    // Action: Slot 1 (Soundcheck) löschen
    const slotKey = '2026-07-28|Soundcheck';
    _deleteSlotFromQueue('Thomas', slotKey);

    // Assertion: Slot wurde gelöscht, aber andere Slots sind noch da
    const remaining = _getCrewUpdateQueue();
    assert.equal(remaining['Thomas'].slots.length, 2, 'Nach Löschung: 2 Slots übrig');
    assert.equal(remaining['Thomas'].slots[0].posLabel, 'Systemtech', 'Slot 0 bleibt Systemtech');
    assert.equal(remaining['Thomas'].slots[1].posLabel, 'Setup', 'Slot 1 ist jetzt Setup (nicht verschoben!)');

    // Wichtig: Setup-Slot sollte IMMER noch via '2026-07-29|Setup' löschbar sein
    const setupKey = '2026-07-29|Setup';
    assert.ok(
      remaining['Thomas'].slots.some(s => `${s.date}|${s.posLabel}` === setupKey),
      'Setup-Slot ist via slotKey noch findbar'
    );
  });

  test('Bug Fix 2: slot.selected Persistence nach Modal Re-Render', () => {
    // Setup
    const queue = {
      'Peter': {
        email: 'peter@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true },
          { date: '2026-07-28', posLabel: 'Soundcheck', selected: false },
          { date: '2026-07-29', posLabel: 'Setup', selected: true }
        ]
      }
    };
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(queue));

    // Action: Modal öffnen (rendert HTML)
    const mockBody = document.createElement('div');
    mockBody.id = 'crewUpdateModalBody';
    document.body.appendChild(mockBody);

    _openUpdateQueueModal();

    // Assertion: HTML-Checkboxen spiegeln slot.selected wider
    const checkboxes = mockBody.querySelectorAll('input[type=checkbox]');
    assert.equal(checkboxes.length, 3, '3 Checkboxen gerendert');
    assert.equal(checkboxes[0].checked, true, 'Checkbox 0 (Systemtech) ist checked');
    assert.equal(checkboxes[1].checked, false, 'Checkbox 1 (Soundcheck) ist NICHT checked');
    assert.equal(checkboxes[2].checked, true, 'Checkbox 2 (Setup) ist checked');

    // Cleanup
    mockBody.remove();
  });

  test('Bug Fix 3: _toggleSlotSelection speichert State persistent', () => {
    // Setup
    const queue = {
      'Wolf': {
        email: 'wolf@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true }
        ]
      }
    };
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(queue));

    // Action: Checkbox auswählen/abwählen
    const mockCheckbox = document.createElement('input');
    mockCheckbox.type = 'checkbox';
    mockCheckbox.dataset.crew = 'Wolf';
    mockCheckbox.dataset.key = '2026-07-27|Systemtech';
    mockCheckbox.checked = false;

    _toggleSlotSelection(mockCheckbox);

    // Assertion: State wurde in localStorage gespeichert
    const saved = _getCrewUpdateQueue();
    assert.equal(saved['Wolf'].slots[0].selected, false, 'slot.selected wurde auf false gespeichert');

    // Action: Zweiter Toggle (zurück auf true)
    mockCheckbox.checked = true;
    _toggleSlotSelection(mockCheckbox);

    // Assertion: State wurde wieder gespeichert
    const saved2 = _getCrewUpdateQueue();
    assert.equal(saved2['Wolf'].slots[0].selected, true, 'slot.selected wurde auf true gespeichert');
  });
});

describe('UpdateQueueModal - Performance (DOM-Free State)', () => {

  test('_updateSendButton liest aus Queue, nicht aus DOM', () => {
    // Setup: Queue mit gemischten selected-States
    const queue = {
      'Thomas': {
        email: 'thomas@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true },
          { date: '2026-07-28', posLabel: 'Soundcheck', selected: false },
          { date: '2026-07-29', posLabel: 'Setup', selected: true }
        ]
      },
      'Peter': {
        email: 'peter@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true }
        ]
      }
    };
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(queue));

    // Action: Button aktualisieren
    const mockBtn = document.createElement('button');
    mockBtn.id = 'btnSendUpdates';
    document.body.appendChild(mockBtn);

    _updateSendButton();

    // Assertion: Button zeigt KORREKTE Anzahl (nicht DOM-Checkboxes)
    assert.equal(mockBtn.textContent, 'AUSWAHL SENDEN (3) →', 'Button zählt 3 ausgewählte Slots (ignoriert DOM)');

    // Cleanup
    mockBtn.remove();
  });

  test('_sendSelectedUpdates liest aus Queue statt DOM', () => {
    // Setup
    const queue = {
      'Philine': {
        email: 'philine@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech', selected: true },
          { date: '2026-07-28', posLabel: 'Soundcheck', selected: false }
        ]
      }
    };
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(queue));

    // Mock _sendQueueEntries um zu sehen was übergeben wird
    let capturedQueue = null;
    const originalSend = window._sendQueueEntries;
    window._sendQueueEntries = async (q) => { capturedQueue = q; };

    // Action: _sendSelectedUpdates ausführen
    _sendSelectedUpdates().then(() => {
      // Assertion: Nur ausgewählte Slots wurden übergeben
      assert.ok(capturedQueue['Philine'], 'Philine hat ausgewählte Slots');
      assert.equal(capturedQueue['Philine'].slots.length, 1, 'Nur 1 Slot gesendet (Soundcheck ausgeschlossen)');
      assert.equal(capturedQueue['Philine'].slots[0].posLabel, 'Systemtech', 'Systemtech wurde gesendet');

      // Assertion: Abgewählte Slots bleiben in Queue
      const remaining = _getCrewUpdateQueue();
      assert.equal(remaining['Philine'].slots.length, 1, '1 abgewählter Slot bleibt in Queue');
      assert.equal(remaining['Philine'].slots[0].posLabel, 'Soundcheck', 'Soundcheck bleibt in Queue');

      // Cleanup
      window._sendQueueEntries = originalSend;
    });
  });
});

describe('UpdateQueueModal - Backwards Compatibility', () => {

  test('Alte Queue ohne slot.selected → wird als true behandelt', () => {
    // Setup: Alte Queue-Format ohne slot.selected
    const oldQueue = {
      'Oliver': {
        email: 'oliver@test.de',
        slots: [
          { date: '2026-07-27', posLabel: 'Systemtech' },  // ← kein selected
          { date: '2026-07-28', posLabel: 'Soundcheck' }   // ← kein selected
        ]
      }
    };
    localStorage.setItem('crewplan_updates_' + (activePlanId || ''), JSON.stringify(oldQueue));

    // Action: _openUpdateQueueModal rendert alte Queue
    const mockBody = document.createElement('div');
    mockBody.id = 'crewUpdateModalBody';
    document.body.appendChild(mockBody);

    _openUpdateQueueModal();

    // Assertion: Beide Slots sind checked (weil selected !== false → true)
    const checkboxes = mockBody.querySelectorAll('input[type=checkbox]');
    assert.equal(checkboxes[0].checked, true, 'Slot ohne selected ist checked');
    assert.equal(checkboxes[1].checked, true, 'Slot ohne selected ist checked');

    // Cleanup
    mockBody.remove();
  });
});

// =============================================================================
// TEST RUNNER
// =============================================================================

function describe(suiteName, fn) {
  console.group(`📋 ${suiteName}`);
  fn();
  console.groupEnd();
}

function test(testName, fn) {
  try {
    fn();
  } catch(e) {
    console.error(`✗ ${testName}: ${e.message}`);
    throw e;
  }
}

// Auto-run wenn in Browser-Console geladen
if (typeof window !== 'undefined') {
  console.log('='.repeat(70));
  console.log('UNIT TESTS: UpdateQueueModal v0.9.11.5');
  console.log('='.repeat(70));
  // Manuell starten: runTests()
}

function runTests() {
  try {
    // Alle Tests ausführen
  } catch(e) {
    console.error('TEST FAILED:', e);
  }
}
