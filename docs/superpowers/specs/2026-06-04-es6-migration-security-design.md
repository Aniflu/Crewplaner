# Spec: ES6 Module Migration, State Reform & Security Hardening

**Date:** 2026-06-04  
**Status:** Approved  
**Scope:** Full modernization — security fixes, ES6 module migration, centralized state management

---

## Context

A code review by an external developer identified the manual `bundle.js` sync as a critical maintenance risk. A deeper analysis uncovered three additional problems:

1. **Security:** Stored XSS in `render.js`, silent auth bypass in `authService.js`, and no centralized PocketBase filter sanitization.
2. **Dead code:** 6 source files (`crew.js`, `positions.js`, `modals.js`, `dates.js`, `logos.js`, `calendar.js`) exist on disk but are never loaded — their content lives in `bundle.js`, which has silently diverged from them.
3. **State fragility:** 14 mutable global variables are written from 5–7 different files with no coordination. `cancelProposal()` deletes a PocketBase record without cleaning `assignmentStatuses`, causing a known stale-state bug.

The goal is to eliminate all three problem areas in a single, phased effort. Each phase ships independently to production.

---

## Approach: Phasenweise Migration (3 Phasen)

All three phases produce the same end-state as a "Big Bang" rewrite but each phase is independently deployable, testable, and rollback-safe.

---

## Phase 1: Security Sprint

**Scope:** 3 targeted fixes in 3 files. No architecture changes. Can be deployed in minutes.

### Fix 1 — Stored XSS in `render.js`

**Location:** `js/render.js` lines 130, 135, 137  
**Problem:** The `display` variable (set from PocketBase crew name fields and `si.crewName`) is interpolated directly into `innerHTML` without escaping. A malicious crew name like `<img src=x onerror=alert(1)>` stored in PocketBase would execute on render.  
**Fix:** Replace `${display}` with `${esc(display)}` at all three injection points. The `esc()` function already exists in `utils.js` and is correctly used in adjacent branches of the same function.

```js
// render.js — three places:
// Before: `...>${display}</span>`
// After:  `...>${esc(display)}</span>`
// Before: `...>${display}</button>`
// After:  `...>${esc(display)}</button>`
```

### Fix 2 — Silent Auth Bypass in `authService.js`

**Location:** `js/authService.js` lines 83–87  
**Problem:** The outer `catch(e)` block calls `startApp()` after any unhandled error, leaving the app running with no authenticated user. All role flags remain at their falsy defaults but no redirect occurs.  
**Fix:** Replace `startApp()` in the catch block with a redirect to `login.html`, matching the existing inner token-expiry handler.

```js
// Before:
} catch(e) {
  console.error('Auth-Fehler:', e);
  document.body.style.visibility = 'visible';
  startApp();
}
// After:
} catch(e) {
  console.error('Auth-Fehler:', e);
  window.location.href = 'login.html';
}
```

### Fix 3 — PocketBase Filter Injection in `pb.js` + `dataService.js`

**Location:** `js/pb.js` (add helper), `js/dataService.js` (8 filter strings)  
**Problem:** Filter values are interpolated into PocketBase filter strings with only a `replace(/"/g, '\\"')` guard. PocketBase's filter DSL has additional injection vectors.  
**Fix:** Add a `pbEscapeFilter(val)` helper to `pb.js` that escapes `"`, `'`, `\`, and `%`. Replace all 8 ad-hoc filter constructions in `dataService.js` with this helper.

```js
// pb.js — add:
function pbEscapeFilter(val) {
  return String(val == null ? '' : val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}
```

---

## Phase 2: ES6 Module Migration

**Scope:** Convert all 24 script tags to a single `<script type="module" src="js/app.js">` entry point. Delete `bundle.js` and the 6 dead standalone files.

### Entry Point

`js/app.js` becomes the single entry point for `index.html`. It imports `init.js` which imports everything else. `admin.html` gets its own `js/admin-app.js` entry point importing only what the admin console needs.

### Module Dependency Order

Modules must be migrated in this order to avoid circular imports:

```
Layer 0 (no deps):      config.js, state.js
Layer 1 (← config):    pb.js
Layer 2 (← state):     rbac.js, types.js
Layer 2 (← state,pb):  utils.js
Layer 3 (← pb,state):  dataService.js, authService.js
Layer 4 (← state,utils): render.js, tourblock.js, stats.js
Layer 5 (← all):       dropdown.js, crewNotify.js, userView.js, plans.js,
                        sidebar.js, emailLog.js, crewLink.js, persistence.js,
                        blockview.js, crewview.js, pdf.js, crewview.js, dialog.js
Layer 6:                init.js
Layer 7 (entry):        app.js, admin-app.js
```

### bundle.js Decomposition

`bundle.js` is deleted. Its 6 sections become standalone modules, taking the **bundle.js version** of each function (not the outdated standalone versions) because bundle.js has two corrections the standalones lack:

- `crew.js`: `addCrew()` gets the duplicate-name guard (`if(crew.includes(n))`)
- `logos.js`: `applyLogoToHeader()` keeps the `img.alt` attributes

The old standalone files are deleted along with `bundle.js`.

### Export Convention

All public functions and constants get named exports. Internal helpers (prefixed with `_`) remain module-private (not exported).

```js
// Example: utils.js
export function getVal(dateStr, posId) { ... }
export function isPending(si) { ... }
export function esc(s) { ... }
export function showToast(msg, color) { ... }
// _internal helpers: no export keyword
```

### Cache-Busting

The manual `?v=NN` query strings on each script tag are eliminated. With a single entry point, the browser cache is controlled by the `app.js` URL alone. Add `?v=NN` only to `app.js` and `admin-app.js` after each deployment.

### index.html / admin.html Changes

```html
<!-- index.html: replace all 24 <script> tags with: -->
<script type="module" src="js/app.js?v=1"></script>

<!-- admin.html: replace all <script> tags with: -->
<script type="module" src="js/admin-app.js?v=1"></script>
```

**Note on `defer`:** ES6 modules are deferred by default — they execute after the DOM is parsed. This is the correct behavior and matches the current `DOMContentLoaded`-based init pattern. No changes to init logic needed.

**`login.html` and `view.html` are NOT in scope** — they use minimal script sets and work independently. Only `index.html` and `admin.html` get the module entry-point treatment.

**`admin-app.js` vs `app.js`:** `app.js` imports the full feature set including crew confirmation UI (`userView.js`). `admin-app.js` imports only the admin-console subset: `authService`, `dataService`, `plans`, `emailLog`, `crewNotify`, `crewLink`, `render`, `state` — omitting crew-facing modules like `userView.js`.

---

## Phase 3: State Reform

**Scope:** Centralize all state mutations through `state.js`. Fix the `cancelProposal` stale-state bug and the cross-layer divergence risk.

### New `state.js` API

`state.js` exports both the state and mutation functions. No other module writes state directly.

```js
// State (module-private)
let _assignments = {};
let _assignmentStatuses = {};
let _tourDates = [];
let _positions = [...DEFAULT_POSITIONS];
let _crew = [...DEFAULT_CREW];
let _defaultCrew = {};
let _crewMeta = {};
let _logos = { booking: '', band: '', planer: '' };

// Auth state
export let USER_ROLE = 'crew';
export let IS_MANAGER = false;
export let IS_SUPERADMIN = false;
export let IS_BOOKER = false;
export let IS_CREW = true;
export let IS_ADMIN = false;
export let CURRENT_USER_ID = null;
export let CURRENT_USER_EMAIL = null;

// Getters
export const getAssignments = () => _assignments;
export const getStatuses = () => _assignmentStatuses;
export const getTourDates = () => _tourDates;
export const getPositions = () => _positions;
export const getCrew = () => _crew;
export const getDefaultCrew = () => _defaultCrew;
export const getCrewMeta = () => _crewMeta;
export const getLogos = () => _logos;

// Setters / Mutations
export const setAssignment = (date, posId, value) => {
  if (!_assignments[date]) _assignments[date] = {};
  _assignments[date][posId] = value;
};
export const clearAssignmentSlot = (date, posId) => {
  if (_assignments[date]) delete _assignments[date][posId];
};
export const loadAssignments = (data) => { _assignments = data || {}; };

export const setStatus = (date, posId, statusObj) => {
  if (!_assignmentStatuses[date]) _assignmentStatuses[date] = {};
  _assignmentStatuses[date][posId] = statusObj;
};
export const clearStatus = (date, posId) => {       // ← fixes cancelProposal bug
  if (_assignmentStatuses[date]) delete _assignmentStatuses[date][posId];
};
export const loadStatuses = (data) => { _assignmentStatuses = data || {}; };

export const setTourDates = (dates) => { _tourDates = [...dates]; };
export const setPositions = (positions) => { _positions = [...positions]; };
export const setCrew = (crew) => { _crew = [...crew]; };
export const setDefaultCrew = (dc) => { _defaultCrew = { ...dc }; };
export const setCrewMeta = (meta) => { _crewMeta = { ...meta }; };
export const setLogos = (logos) => { _logos = { ...logos }; };

export const setUserRole = (role) => {
  USER_ROLE = role;
  IS_SUPERADMIN = role === 'superadmin';
  IS_MANAGER = role === 'manager' || role === 'superadmin';
  IS_BOOKER = role === 'booker';
  IS_CREW = role === 'crew';
  IS_ADMIN = IS_MANAGER;
};
export const setCurrentUser = (id, email) => {
  CURRENT_USER_ID = id;
  CURRENT_USER_EMAIL = email;
};
```

### cancelProposal Bug Fix

`dataService.js`'s `cancelProposal()` and `bulkCancelProposals()` will call `clearStatus(date, posId)` after successfully deleting the PocketBase record, instead of leaving the stale entry in memory.

### userView.js Direct Mutations

The 5 places in `userView.js` that directly mutate `assignmentStatuses[date][posId]` will be replaced with `setStatus(date, posId, {...})` calls imported from `state.js`.

### Cross-Layer Consistency

After Phase 3, `getVal()` in `utils.js` continues to work as before (reading from `_assignments` via `getAssignments()`). The function signature does not change — callers are unaffected.

---

## Files Changed Summary

| File | Phase | Action |
|---|---|---|
| `js/render.js` | 1 | Fix 3 XSS injection points |
| `js/authService.js` | 1 | Fix catch block auth bypass |
| `js/pb.js` | 1 | Add `pbEscapeFilter()` helper |
| `js/dataService.js` | 1+3 | Use `pbEscapeFilter()`, use `clearStatus()` in cancel |
| `js/bundle.js` | 2 | Delete |
| `js/crew.js`, `positions.js`, `modals.js`, `dates.js`, `logos.js`, `calendar.js` (old) | 2 | Delete (old standalone versions) |
| `js/crew.js`, `positions.js`, `modals.js`, `dates.js`, `logos.js`, `calendar.js` (new) | 2 | Recreate from bundle.js content with exports |
| All 24 JS files | 2 | Add `import`/`export`, remove global scope reliance |
| `js/app.js` | 2 | Create — entry point for index.html |
| `js/admin-app.js` | 2 | Create — entry point for admin.html |
| `index.html` | 2 | Replace 24 script tags with 1 module tag |
| `admin.html` | 2 | Replace script tags with 1 module tag |
| `js/state.js` | 3 | Rewrite with getter/setter API |
| `js/userView.js` | 3 | Replace 5 direct state mutations |
| `js/dataService.js` | 3 | Use state setters throughout |
| `js/dropdown.js` | 3 | Use state setters for assignments |
| `js/plans.js` | 3 | Use state setters for plan load |
| `js/persistence.js` | 3 | Use state setters for LS restore |

---

## Verification

### Phase 1
- [ ] Login als Manager → Crew-Slot mit Name `<img src=x onerror=alert(1)>` in PocketBase anlegen → Tabelle rendern → kein Alert
- [ ] `localStorage.removeItem('pb_token')` → Seite neu laden → Redirect zu `login.html` (kein stiller App-Start)
- [ ] Filter-Strings in DevTools Network tab: keine unescapten Sonderzeichen in `filter=` queries

### Phase 2
- [ ] `index.html` öffnen → DevTools Network: genau 1 JS-Request (`app.js`) + die darin importierten Module
- [ ] Alle bestehenden Funktionen per Smoke-Test: Login, Crew-Slot setzen, E-Mail-Log öffnen, Plan laden
- [ ] `bundle.js` existiert nicht mehr im Repo
- [ ] Alle 6 alten Standalone-Dateien existieren nicht mehr (nur die neuen mit exports)

### Phase 3
- [ ] Slot proposed → `cancelProposal()` → DevTools: kein staler `assignmentStatuses`-Eintrag im State (prüfbar via `import { getStatuses } from './state.js'` in Console)
- [ ] Crew-Mitglied bestätigt Slot → `IS_MANAGER`-Ansicht zeigt sofort grünen Status (kein Reload nötig)
- [ ] Kompletter Regression-Test: Einladen → Bestätigen → Absagen → Update-Mail

---

## Out of Scope

- Build-Tools (Vite, Webpack, esbuild) — bewusst nicht eingeführt
- TypeScript — kein Typ-System, bleibt Vanilla JS
- Test-Framework (Jest, Vitest) — bestehender manueller Test-Ansatz bleibt
- Backend-Änderungen — PocketBase-Hook bleibt unverändert
- `login.html` und `view.html` — keine Modul-Migration, da eigenständige minimal-Scripts
- Reaktive State-Updates (Signals, Proxies, MobX) — bewusst nicht eingeführt; getter/setter-Modell reicht für diesen Use-Case
