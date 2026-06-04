# ES6 Module Migration, State Reform & Security Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden security (XSS, auth bypass, filter injection), replace the 24-script global-scope architecture with ES6 modules (eliminating `bundle.js`), and centralize all state mutations through `state.js` getters/setters.

**Architecture:** Three independently deployable phases: Phase 1 patches security vulnerabilities in-place; Phase 2 converts all JS to ES6 modules with a single `app.js` entry point, deleting `bundle.js` and six dead source files; Phase 3 replaces direct global state mutations with a centralized getter/setter API in `state.js`, fixing the `cancelProposal` stale-state bug.

**Tech Stack:** Vanilla JS, ES6 modules (native browser, no bundler), PocketBase REST, GitHub Pages

---

## File Structure

| File | Phase | Change |
|---|---|---|
| `js/render.js` | 1 | Fix 3 XSS injection points (`${display}` → `${esc(display)}`) |
| `js/authService.js` | 1+2 | Fix catch-block auth bypass; add imports/exports |
| `js/pb.js` | 1+2 | Add `pbEscapeFilter()`; add exports |
| `js/dataService.js` | 1+2+3 | Use `pbEscapeFilter`; add imports/exports; use state setters |
| `js/config.js` | 2 | Add exports |
| `js/state.js` | 2+3 | Phase 2: add exports to all globals; Phase 3: rewrite with getter/setter API |
| `js/utils.js` | 2 | Add imports from state.js + config.js; add exports |
| `js/rbac.js` | 2 | Add imports from state.js; add export |
| `js/types.js` | 2 | Add imports from state.js; add exports |
| `js/render.js` | 2 | Add imports; add exports |
| `js/tourblock.js`, `js/stats.js`, `js/sidebar.js` | 2 | Add imports; add exports |
| `js/blockview.js`, `js/crewview.js` | 2 | Add imports; add exports |
| `js/dropdown.js` | 2+3 | Add imports; add exports; use state setters |
| `js/plans.js`, `js/persistence.js` | 2+3 | Add imports; add exports; use state setters |
| `js/crewNotify.js`, `js/crewLink.js` | 2 | Add imports; add exports |
| `js/userView.js` | 2+3 | Add imports; add exports; fix 5 direct state mutations |
| `js/emailLog.js` | 2 | Add imports; add exports |
| `js/pdf.js` | 2 | Add imports; add exports |
| `js/dialog.js` | 2 | Add exports |
| `js/init.js` | 2 | Add imports; add exports |
| `js/bundle.js` | 2 | **Delete** |
| `js/crew.js` (old) | 2 | **Delete** (replaced by new version from bundle.js) |
| `js/positions.js`, `js/modals.js`, `js/dates.js`, `js/logos.js`, `js/calendar.js` (old) | 2 | **Delete** (replaced by new versions from bundle.js) |
| `js/crew.js` (new) | 2 | **Create** — extracted from bundle.js with `export` keywords |
| `js/positions.js`, `js/modals.js`, `js/dates.js`, `js/logos.js`, `js/calendar.js` (new) | 2 | **Create** — extracted from bundle.js with `export` keywords |
| `js/app.js` | 2 | **Create** — entry point for `index.html` |
| `js/admin-app.js` | 2 | **Create** — entry point for `admin.html` |
| `index.html` | 2 | Replace 24 `<script>` tags with 1 module tag |
| `admin.html` | 2 | Replace 4 `<script>` tags with 1 module tag |

---

## Phase 1: Security Sprint

> These three fixes are backward-compatible. No module changes. Deploy immediately after commit.

---

### Task 1: Fix Stored XSS in `render.js`

**Files:** Modify `js/render.js`

**Problem:** The `display` variable (set from PocketBase crew names via `val` and `si.crewName`) is interpolated unescaped into `innerHTML` in three branches at the bottom of the `POSITIONS.forEach` loop.

- [ ] **Open `js/render.js` and find the three injection points at the end of the `POSITIONS.forEach` block:**

```
}else if(IS_MANAGER||!SUPABASE_ENABLED){
  b+=`<button class="${cls}" style="${style}" onclick="openCrewDD(event,'${row.date}','${p.id}')">${display}</button>`;
```

```
}else if(IS_BOOKER){
  b+=`<span class="${cls}" style="${style};cursor:default;">${display}</span>`;
```

```
}else if(!IS_CREW){
  b+=`<button class="${cls}" style="${style}" disabled>${display}</button>`;
```

- [ ] **Replace all three — change `${display}` to `${esc(display)}` in each:**

```js
}else if(IS_MANAGER||!SUPABASE_ENABLED){
  b+=`<button class="${cls}" style="${style}" onclick="openCrewDD(event,'${row.date}','${p.id}')">${esc(display)}</button>`;
```

```js
}else if(IS_BOOKER){
  b+=`<span class="${cls}" style="${style};cursor:default;">${esc(display)}</span>`;
```

```js
}else if(!IS_CREW){
  b+=`<button class="${cls}" style="${style}" disabled>${esc(display)}</button>`;
```

- [ ] **Verify:** In PocketBase Admin (`https://api.crewplanner.nyxlightwork.de/_/`), find any `crew_members` record and temporarily set `name` to `<img src=x onerror="alert('xss')">`. Open the app as manager → table renders → **no alert fires**. Restore the name afterward.

---

### Task 2: Fix Silent Auth Bypass in `authService.js`

**Files:** Modify `js/authService.js`

**Problem:** The outer `catch(e)` block (last ~5 lines of `_authCheckAndStart`) calls `startApp()` after any unexpected JS error, leaving the app running with no authenticated user. All role flags stay at their falsy defaults (no redirect).

- [ ] **Find the outer catch block at the end of `_authCheckAndStart` (around line 83):**

```js
  } catch (e) {
    console.error('Auth-Fehler:', e);
    document.body.style.visibility = 'visible';
    startApp();
  }
```

- [ ] **Replace it with a redirect — same as the inner token-expiry handler:**

```js
  } catch (e) {
    console.error('Auth-Fehler:', e);
    window.location.href = 'login.html';
  }
```

- [ ] **Verify:** Open browser DevTools console. Run `localStorage.removeItem('pb_token')` then reload `index.html`. Expected: immediate redirect to `login.html`, **no app content shown**.

---

### Task 3: Add `pbEscapeFilter()` to `pb.js` + Update `dataService.js`

**Files:** Modify `js/pb.js`, modify `js/dataService.js`

**Problem:** PocketBase filter strings in `dataService.js` are built by string interpolation with only an ad-hoc `replace(/"/g, '\\"')` guard. A centralized helper should replace all ad-hoc escaping.

- [ ] **Add `pbEscapeFilter` to `js/pb.js`, immediately before the `pbList` function:**

```js
// Escapes a value for safe use inside PocketBase filter strings (double or single quoted)
function pbEscapeFilter(val) {
  return String(val == null ? '' : val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}
```

- [ ] **In `js/dataService.js`, replace every ad-hoc filter construction with `pbEscapeFilter`.** Find all occurrences of `.replace(/"/g, '\\"')` and inline string interpolations in filter arguments. Replace with the pattern `pbEscapeFilter(value)`:

```js
// BEFORE (example — find similar patterns throughout):
`plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`

// AFTER:
`plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`
```

```js
// BEFORE (email filter with manual escape):
`email = "${email.replace(/"/g, '\\"')}"`

// AFTER:
`email = "${pbEscapeFilter(email)}"`
```

Apply to all filter strings in `dataService.js` — search for `await pbFirst(` and `await pbList(` and `await pbListAll(` to find all occurrences. There are approximately 8–10 filter strings to update.

- [ ] **Verify:** Open DevTools → Network → filter by `records`. Trigger a plan load. Check that `filter=` query params in requests contain proper escaped values and no raw user input.

---

### Task 4: Commit Phase 1

- [ ] **Run a quick smoke test:** Login as manager, open the app, verify the table renders correctly and no console errors appear.

- [ ] **Commit:**

```bash
git add js/render.js js/authService.js js/pb.js js/dataService.js
git commit -m "fix: Security Sprint — stored XSS, auth bypass, PB filter injection"
```

- [ ] **Deploy:** `git push origin main` — GitHub Pages updates in ~1 min. Verify live site works.

---

## Phase 2: ES6 Module Migration

> Convert all 24 script tags to a single `<script type="module">` entry point. Delete `bundle.js` and 6 dead source files.
>
> **Strategy:** Work through dependency layers bottom-up. Each file gets an `import` block at the top and `export` keywords on public declarations. Function bodies do NOT change. After all files are migrated, create entry points and update HTML.

---

### Task 5: Migrate Layer 0 — `config.js` and `state.js`

**Files:** Modify `js/config.js`, modify `js/state.js`

These two files have no dependencies on other project modules — they only export.

- [ ] **Replace `js/config.js` with this complete file:**

```js
// ── Pocketbase-Konfiguration ────────────────────────────────────────────────────
export const POCKETBASE_URL = 'https://api.crewplanner.nyxlightwork.de';
export const SUPABASE_ENABLED = true;
```

- [ ] **In `js/state.js`, add `export` to every top-level declaration.** Change `const TOUR_DATES` to `let TOUR_DATES` (it is mutated at runtime). The file already has the correct structure — just add `export` keywords:

Find and update each declaration:
```js
// BEFORE:
const OFFEN     = '__offen__';
const OFFDAY       = '__offday__';
const REISE_TAG    = '__reise_tag__';
const AUSSCHREIBEN = '__ausschreiben__';
const CREW_COLORS = [...];
const DE_DAYS = [...];
const DE_MON  = [...];
const DE_MON_FULL = [...];
let POSITIONS = [...];
let crew = [...];
let defaultCrew = {};
let assignments  = {};
let logos = {...};
let crewMeta = {};
let assignmentStatuses = {};
let USER_ROLE     = 'crew';
let IS_SUPERADMIN = false;
let IS_MANAGER    = false;
let IS_BOOKER     = false;
let IS_CREW       = false;
let IS_ADMIN      = false;
let CURRENT_USER_ID = null;
let CURRENT_USER_EMAIL = null;
const TOUR_DATES = [...];   // ← also change const → let

// AFTER (add export to every line):
export const OFFEN     = '__offen__';
export const OFFDAY       = '__offday__';
export const REISE_TAG    = '__reise_tag__';
export const AUSSCHREIBEN = '__ausschreiben__';
export const CREW_COLORS = [...];
export const DE_DAYS = [...];
export const DE_MON  = [...];
export const DE_MON_FULL = [...];
export let POSITIONS = [...];
export let crew = [...];
export let defaultCrew = {};
export let assignments  = {};
export let logos = {...};
export let crewMeta = {};
export let assignmentStatuses = {};
export let USER_ROLE     = 'crew';
export let IS_SUPERADMIN = false;
export let IS_MANAGER    = false;
export let IS_BOOKER     = false;
export let IS_CREW       = false;
export let IS_ADMIN      = false;
export let CURRENT_USER_ID = null;
export let CURRENT_USER_EMAIL = null;
export let TOUR_DATES = [...];   // ← const → let + export
```

**Important:** Keep all array/object literal values exactly as they are — only add `export` and change the one `const` to `let`. Do not move or reorder anything.

---

### Task 6: Migrate Layer 1 — `pb.js`

**Files:** Modify `js/pb.js`

- [ ] **Add import block at the very top of `js/pb.js`:**

```js
import { POCKETBASE_URL } from './config.js';
```

- [ ] **Add `export` to every public function** (keep `_pbFetch` private — it already has the `_` prefix convention):

```js
export function pbGet(path)          { return _pbFetch('GET',    path);       }
export function pbPost(path, body)   { return _pbFetch('POST',   path, body); }
export function pbPatch(path, body)  { return _pbFetch('PATCH',  path, body); }
export function pbDelete(path)       { return _pbFetch('DELETE', path);       }
export function pbEscapeFilter(val) { ... }   // already added in Task 3
export function pbList(collection, filter, sort, perPage) { ... }
export async function pbListAll(collection, filter, sort) { ... }
export async function pbFirst(collection, filter) { ... }
export async function pbUpsert(collection, filter, createData, updateData) { ... }
```

---

### Task 7: Migrate Layer 2 — `utils.js`, `rbac.js`, `types.js`

**Files:** Modify `js/utils.js`, modify `js/rbac.js`, modify `js/types.js`

#### `utils.js`

- [ ] **Add import block at top of `js/utils.js`:**

```js
import { assignments, defaultCrew, TOUR_DATES, DE_DAYS, DE_MON } from './state.js';
import { TYPE_OPTS } from './types.js';
```

- [ ] **Add `export` to every public function:**

```js
export function parseD(s) { ... }
export function fmtD(s) { ... }
export function fmtDParts(s) { ... }
export function sortInsert(row) { ... }
export function getVal(dateStr, posId) { ... }
export function dw(row) { ... }
export function fmt(n) { ... }
export function colorToDarkBg(hex) { ... }
export function isPending(si) { ... }
export function showToast(msg, color='#4f81bd') { ... }
export function esc(s) { ... }
```

**Note:** `sortInsert` mutates `TOUR_DATES` directly. This still works with ES6 exports because the array reference is shared. Phase 3 will replace this with a setter.

#### `rbac.js`

- [ ] **Replace `js/rbac.js` with this complete file** (adds import + export):

```js
// ── Role-Based Access Control — v1 ────────────────────────────────────────────
import { IS_SUPERADMIN, IS_MANAGER, IS_BOOKER, IS_CREW } from './state.js';

export function hasPermission(action) {
  if (IS_SUPERADMIN) return true;
  switch (action) {
    case 'assignCrew':
    case 'createPlan':
    case 'editPlan':
    case 'deletePlan':
    case 'addDate':
    case 'removeDate':
    case 'addPosition':
    case 'removePosition':
    case 'addCrewMember':
    case 'removeCrewMember':
    case 'sendInvite':
    case 'sendReminder':
    case 'sendCancellation':
    case 'cancelAssignment':
    case 'linkCrewEmail':
      return IS_MANAGER;
    case 'viewAllAssignments':
    case 'viewStats':
      return IS_BOOKER || IS_MANAGER;
    case 'confirmOwnAssignment':
    case 'declineOwnAssignment':
      return IS_CREW || IS_MANAGER;
    case 'exportPDF':
    case 'exportCalendar':
      return true;
    case 'accessAdminConsole':
    case 'manageUsers':
    case 'manageRoles':
      return IS_SUPERADMIN;
    default:
      return false;
  }
}
```

#### `types.js`

- [ ] **Add import block at top of `js/types.js`:**

```js
import { OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN } from './state.js';
```

- [ ] **Add `export` to every top-level declaration in `types.js`:**

```js
export const TYPE_COLOR_DEFAULTS = { ... };
export const TYPE_WEIGHT_DEFAULTS = { ... };
export const DEFAULT_TYPE_OPTS = [ ... ];
export let TYPE_OPTS = DEFAULT_TYPE_OPTS.map(o=>({...o}));
export const TYPES_KEY = 'tourplan_custom_types';
export function _fillTypeDefaults(entry) { ... }
export function loadCustomTypes() { ... }
export function renderTypeList() { ... }
// ... add export to every other top-level function in the file
```

---

### Task 8: Migrate Layer 3 — `dataService.js` and `authService.js`

**Files:** Modify `js/dataService.js`, modify `js/authService.js`

#### `dataService.js`

- [ ] **Add import block at top of `js/dataService.js`:**

```js
import { POCKETBASE_URL, SUPABASE_ENABLED } from './config.js';
import {
  POSITIONS, crew, defaultCrew, assignments, crewMeta,
  assignmentStatuses, TOUR_DATES, IS_CREW, IS_MANAGER,
  CURRENT_USER_EMAIL, USER_ROLE
} from './state.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList, pbListAll, pbFirst, pbUpsert, pbEscapeFilter } from './pb.js';
import { showToast } from './utils.js';
```

- [ ] **Add `export` to all public functions** — every function not prefixed with `_`:

```js
export async function loadPlanForCrew() { ... }
export async function loadPlanForManager() { ... }
export async function loadCrewMeta() { ... }
export async function loadAssignmentStatuses() { ... }
export async function proposeCrew(dateStr, posId, crewName, crewEmail) { ... }
export async function confirmAssignment(dateStr, posId) { ... }
export async function declineAssignment(dateStr, posId) { ... }
export async function cancelProposal(dateStr, posId) { ... }
export async function bulkCancelProposals(posId) { ... }
export async function bulkProposeCrew(slots) { ... }
export async function sendCrewInvite(crewName, crewEmail, type) { ... }
export async function sendCancellationNotice(crewName, crewEmail, slots) { ... }
export async function sendAvailabilityNotice(crewName, crewEmail, slots) { ... }
export async function sendUpdateNotice(crewName, crewEmail, slots) { ... }
```

Private helpers (`_getActivePlanId`, `_createOrFetchPlanId`, `_showMailError`, `_getNewSlotsForCrew`) keep their `_` prefix and get **no** `export`.

#### `authService.js`

- [ ] **Add import block at top of `js/authService.js`:**

```js
import { SUPABASE_ENABLED } from './config.js';
import {
  IS_CREW, IS_MANAGER, IS_SUPERADMIN, IS_BOOKER, IS_ADMIN,
  USER_ROLE, CURRENT_USER_ID, CURRENT_USER_EMAIL
} from './state.js';
import { pbPost } from './pb.js';
import { loadPlanForCrew, loadPlanForManager, loadCrewMeta, loadAssignmentStatuses } from './dataService.js';
```

**Important:** `authService.js` assigns directly to the exported `let` variables from `state.js`. In ES6 modules, you can only rebind module-level bindings from within the module that declares them. Since `authService.js` needs to write `USER_ROLE = user.role`, this will fail with a live-binding error.

**Workaround for Phase 2** (Phase 3 will introduce proper setters): Import the state module namespace and use it:

```js
import * as State from './state.js';

// Then replace assignments like:
//   USER_ROLE = user.role
// with:
//   State.USER_ROLE = user.role   ← this still won't work for live bindings

// Correct approach for Phase 2: export setter functions from state.js for auth variables.
```

**Add these setter functions to `state.js`** (add at the bottom of state.js):

```js
export function _setAuthState(userId, email, role) {
  CURRENT_USER_ID    = userId;
  CURRENT_USER_EMAIL = email;
  USER_ROLE          = role;
  IS_SUPERADMIN      = role === 'superadmin';
  IS_MANAGER         = role === 'manager' || IS_SUPERADMIN;
  IS_BOOKER          = role === 'booker';
  IS_CREW            = role === 'crew';
  IS_ADMIN           = IS_MANAGER;
}

export function _clearAuthState() {
  CURRENT_USER_ID = null;
  CURRENT_USER_EMAIL = null;
  USER_ROLE = 'crew';
  IS_SUPERADMIN = false;
  IS_MANAGER = false;
  IS_BOOKER = false;
  IS_CREW = false;
  IS_ADMIN = false;
}
```

- [ ] **In `authService.js`, replace the auth state assignment block** (the ~8 lines after `user = data.record`) with:

```js
import { _setAuthState } from './state.js';

// ...inside _authCheckAndStart, replace the individual assignments:
// BEFORE:
CURRENT_USER_ID    = user.id;
CURRENT_USER_EMAIL = user.email;
USER_ROLE          = user.role || 'crew';
IS_SUPERADMIN      = USER_ROLE === 'superadmin';
IS_MANAGER         = USER_ROLE === 'manager' || IS_SUPERADMIN;
IS_BOOKER          = USER_ROLE === 'booker';
IS_CREW            = USER_ROLE === 'crew';
IS_ADMIN           = IS_MANAGER;

// AFTER:
_setAuthState(user.id, user.email, user.role || 'crew');
```

- [ ] **Add `export` to public functions in `authService.js`:**

```js
export async function _authCheckAndStart() { ... }
export function _handleEmailAction() { ... }
export function _checkPendingAction() { ... }
// startApp is defined in init.js — do NOT export from here
```

Remove the `DOMContentLoaded` listener from `authService.js` — this moves to `app.js` in Task 12.

---

### Task 9: Decompose `bundle.js` into 6 Modules

**Files:** Create 6 new files, delete `bundle.js`, delete 6 old standalone files

`bundle.js` currently contains the merged code of 6 logically separate modules. Extract each section into its own file with proper imports and exports. **Use the bundle.js version of each function** — not the outdated standalone files — because bundle.js has two fixes the standalones lack:
- `crew.js`: `addCrew()` has a duplicate-name guard
- `logos.js`: `applyLogoToHeader()` sets `img.alt` attributes

- [ ] **Create `js/crew.js`** (extract from bundle.js — the crew management section):

```js
import { crew, assignments } from './state.js';
import { showToast } from './utils.js';

export function addCrew(n) {
  n = n.trim();
  if (!n) return;
  if (crew.includes(n)) { showToast('Name bereits vorhanden', '#e84a4a'); return; }
  crew.push(n);
  // ... rest of function body from bundle.js unchanged
}

export function removeCrew(n) { ... }   // body from bundle.js
export function renderCrewList() { ... } // body from bundle.js
```

- [ ] **Create `js/positions.js`** (extract from bundle.js — the positions section):

```js
import { POSITIONS, assignments } from './state.js';
import { showToast } from './utils.js';

export function addPosition(label, short) { ... }   // body from bundle.js
export function removePosition(id) { ... }           // body from bundle.js
export function renderPositionList() { ... }         // body from bundle.js
```

- [ ] **Create `js/modals.js`** (extract from bundle.js — the modal management section):

```js
export function openModal(id) { ... }   // body from bundle.js
export function closeModal(id) { ... }  // body from bundle.js
// ... other modal functions from bundle.js section
```

- [ ] **Create `js/dates.js`** (extract from bundle.js — the date management section):

```js
import { TOUR_DATES, assignments } from './state.js';
import { sortInsert, showToast } from './utils.js';

export function addDate(dateStr, type, typeLabel, loc) { ... }  // body from bundle.js
export function removeDate(dateStr) { ... }                      // body from bundle.js
export function renderDateList() { ... }                         // body from bundle.js
// ... other date functions from bundle.js
```

- [ ] **Create `js/logos.js`** (extract from bundle.js — the logo management section):

```js
import { logos } from './state.js';

export function applyLogoToHeader() { ... }     // body from bundle.js (has img.alt attributes)
export function loadLogosGlobal() { ... }        // body from bundle.js
export function uploadLogo(type, dataUrl) { ... }// body from bundle.js
// ... other logo functions from bundle.js
```

- [ ] **Create `js/calendar.js`** (extract from bundle.js — the ICS calendar section):

```js
import { TOUR_DATES, POSITIONS, assignments } from './state.js';

export function generateICS() { ... }          // body from bundle.js
export function adminGenerateICS() { ... }     // body from bundle.js
// ... other calendar functions from bundle.js
```

- [ ] **Delete `js/bundle.js`:**

```bash
git rm js/bundle.js
```

- [ ] **Delete the 6 old standalone files** (they are superseded by the new versions above):

```bash
git rm js/crew.js js/positions.js js/modals.js js/dates.js js/logos.js js/calendar.js
```

Wait — the new files you just created ARE named `crew.js`, `positions.js`, etc. The old files were already overwritten by the new `Write` operations above. `git rm` will remove old versions tracked by git, but since you're creating new files with the same names, just use `git add` to stage the new versions.

---

### Task 10: Migrate Remaining UI and Feature Modules

**Files:** Modify `js/render.js`, `js/tourblock.js`, `js/stats.js`, `js/sidebar.js`, `js/blockview.js`, `js/crewview.js`, `js/dropdown.js`, `js/plans.js`, `js/crewNotify.js`, `js/crewLink.js`, `js/userView.js`, `js/emailLog.js`, `js/pdf.js`, `js/dialog.js`, `js/persistence.js`

For each file below, add the import block at the top and add `export` to all public top-level functions.

- [ ] **`js/render.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, defaultCrew,
         IS_MANAGER, IS_CREW, IS_BOOKER, IS_SUPERADMIN, IS_ADMIN, SUPABASE_ENABLED,
         OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN, CURRENT_USER_EMAIL } from './state.js';
import { SUPABASE_ENABLED as _SE } from './config.js';
import { getVal, isPending, esc, fmtDParts, parseD, DE_DAYS } from './utils.js';
import { TYPE_OPTS } from './types.js';
```

Export: `renderTable`, `renderHead`, `renderBody`

- [ ] **`js/tourblock.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses,
         IS_MANAGER, IS_CREW, OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN } from './state.js';
import { getVal, isPending, esc, fmtD, parseD } from './utils.js';
```

Export: `renderBlocks` — and any other top-level functions not prefixed with `_`. **How to find them:** `grep -n '^function ' js/tourblock.js` lists every top-level function; add `export` to each one that doesn't start with `_`.

- [ ] **`js/stats.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, assignmentStatuses,
         IS_MANAGER } from './state.js';
import { getVal, dw, fmt, fmtD } from './utils.js';
```

Export: `renderStats`, `updateStats` (and other public functions)

- [ ] **`js/sidebar.js`** — add at top:

```js
import { IS_MANAGER, IS_CREW, SUPABASE_ENABLED } from './state.js';
import { renderTable } from './render.js';
```

Export: `renderSidebar`, `initSidebar` (and other public functions)

- [ ] **`js/blockview.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses,
         IS_MANAGER, OFFEN, OFFDAY, REISE_TAG } from './state.js';
import { getVal, isPending, esc, parseD } from './utils.js';
```

Export: run `grep -n '^function ' js/FILE.js` (replace FILE) to find all top-level functions; add `export` to each not prefixed with `_`

- [ ] **`js/crewview.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, assignmentStatuses,
         IS_MANAGER, CURRENT_USER_EMAIL } from './state.js';
import { getVal, isPending, esc, fmtD } from './utils.js';
```

Export: run `grep -n '^function ' js/FILE.js` (replace FILE) to find all top-level functions; add `export` to each not prefixed with `_`

- [ ] **`js/dropdown.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew,
         assignmentStatuses, IS_MANAGER, IS_CREW,
         OFFEN, OFFDAY, REISE_TAG, AUSSCHREIBEN } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, esc, showToast, sortInsert } from './utils.js';
import { renderTable } from './render.js';
import { pbDelete } from './pb.js';
import { cancelProposal, bulkCancelProposals, proposeCrew } from './dataService.js';
```

Export: `showDD`, `closeDD`, `openCrewDD`, `openDefaultDD`, `openDateDD`, `openTypeDD`, `openPosMenu`, `setAssign`, `requestForPos`, `bulkCancelPos`, `startLocEdit`

- [ ] **`js/plans.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew, logos,
         IS_MANAGER } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast, sortInsert } from './utils.js';
import { pbGet, pbPost, pbPatch, pbDelete } from './pb.js';
```

Export: `getPlansIndex`, `savePlansIndex`, `renderPlanList`, `applyData`, `loadFromPB` (and all other public functions)

- [ ] **`js/persistence.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew, logos } from './state.js';
import { showToast } from './utils.js';
```

Export: run `grep -n '^function ' js/FILE.js` (replace FILE) to find all top-level functions; add `export` to each not prefixed with `_` (`_savePlanToLS`, `_loadPlanFromLS`, etc.)

- [ ] **`js/crewNotify.js`** — add at top:

```js
import { crew, assignments, assignmentStatuses, TOUR_DATES, POSITIONS,
         CURRENT_USER_EMAIL, IS_MANAGER } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast } from './utils.js';
import { pbPost, pbList, pbFirst } from './pb.js';
import { bulkProposeCrew, sendCrewInvite, sendCancellationNotice,
         sendUpdateNotice, loadAssignmentStatuses } from './dataService.js';
```

Export: `openUpdateQueueModal`, `sendUpdateQueue`, `openCancellationQueue`, `sendCancellationQueue`, `bulkProposeCrew` (re-export or wrapper), and other public functions

- [ ] **`js/crewLink.js`** — add at top:

```js
import { IS_MANAGER } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { pbGet, pbPatch } from './pb.js';
import { showToast } from './utils.js';
```

Export: run `grep -n '^function ' js/FILE.js` (replace FILE) to find all top-level functions; add `export` to each not prefixed with `_`

- [ ] **`js/userView.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, crewMeta,
         IS_CREW, IS_MANAGER, CURRENT_USER_EMAIL } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, esc, showToast, fmtD } from './utils.js';
import { pbPatch, pbPost } from './pb.js';
import { confirmAssignment, declineAssignment, loadAssignmentStatuses } from './dataService.js';
import { renderTable } from './render.js';
```

Export: `openSlotConfirmModal`, `bulkConfirmAllMySlots`, `bulkDeclineAllMySlots`, `checkAndOpenMySchedule`, `toggleCancellation` (and all other public functions)

- [ ] **`js/emailLog.js`** — add at top:

```js
import { SUPABASE_ENABLED } from './config.js';
import { pbListAll } from './pb.js';
import { esc } from './utils.js';
```

Export: `renderEmailLog`

- [ ] **`js/pdf.js`** — add at top:

```js
import { TOUR_DATES, POSITIONS, crew, assignments, defaultCrew,
         assignmentStatuses, logos, IS_MANAGER } from './state.js';
import { getVal, isPending, esc, parseD, fmtD } from './utils.js';
import { TYPE_OPTS } from './types.js';
```

Export: `exportPDF`, `printPlan` (and other public functions)

- [ ] **`js/dialog.js`** — no imports needed (pure DOM utility). Add `export` to all public functions:

```js
export function openDialog(...) { ... }
export function closeDialog(...) { ... }
// etc.
```

---

### Task 11: Migrate `init.js`

**Files:** Modify `js/init.js`

`init.js` is the orchestrator — it calls functions from many other modules. It also defines `startApp`, which is called by `authService.js`.

- [ ] **Add import block at top of `js/init.js`:**

```js
import { TOUR_DATES, POSITIONS, crew, assignments, IS_MANAGER, IS_CREW,
         IS_SUPERADMIN, IS_BOOKER, SUPABASE_ENABLED } from './state.js';
import { showToast, esc } from './utils.js';
import { loadCustomTypes, renderTypeList, TYPE_OPTS } from './types.js';
import { renderTable } from './render.js';
import { renderBlocks } from './tourblock.js';
import { renderStats } from './stats.js';
import { loadLogosGlobal } from './logos.js';
import { getPlansIndex, renderPlanList, applyData } from './plans.js';
import { _authCheckAndStart } from './authService.js';
```

- [ ] **Export `startApp` from `init.js`:**

```js
export function startApp() { ... }
```

- [ ] **Verify that `init.js` has no `DOMContentLoaded` listener** — the listener lives in `authService.js` and was already removed in Task 8. `init.js` only exports `startApp` and is called by `_authCheckAndStart`.

---

### Task 12: Create Entry Points `app.js` and `admin-app.js`

**Files:** Create `js/app.js`, create `js/admin-app.js`

- [ ] **Create `js/app.js`:**

```js
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
```

- [ ] **Create `js/admin-app.js`:**

```js
// Entry point for admin.html
import { SUPABASE_ENABLED } from './config.js';
import './state.js';
import './pb.js';
import './utils.js';
import './types.js';
import './plans.js';
import './logos.js';
import './calendar.js';
import './pdf.js';
import './emailLog.js';
import './crewNotify.js';
import './crewLink.js';
import './dialog.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList } from './pb.js';
import { renderEmailLog } from './emailLog.js';
import { loadAssignmentStatuses, loadCrewMeta } from './dataService.js';

// Admin.html has its own inline bootstrap script for auth.
// This entry point ensures all modules are loaded and their functions are available.
// The inline <script> in admin.html calls renderEmailLog(), exportPDF(), etc. as globals.
// Since modules don't pollute window, expose needed functions explicitly:
import { exportPDF } from './pdf.js';
import { adminGenerateICS } from './calendar.js';

window.renderEmailLog = renderEmailLog;
window.exportPDF = exportPDF;
window.adminGenerateICS = adminGenerateICS;
window.pbGet = pbGet;
window.pbPost = pbPost;
window.pbPatch = pbPatch;
window.pbDelete = pbDelete;
window.pbList = pbList;
// Add other functions called from admin.html inline scripts as needed
```

**Note:** `admin.html` has a large inline `<script>` block with its own state stubs and utility functions. These stubs (`getVal`, `isPending`, `esc`, `showToast`, etc.) will conflict with the module versions. In Task 13, the inline script stubs are removed and replaced with imports via `admin-app.js`.

---

### Task 13: Update `index.html` and `admin.html`

**Files:** Modify `index.html`, modify `admin.html`

#### `index.html`

- [ ] **Find the script loading section** (lines 359–383, comment `<!-- SCRIPTS (Ladereihenfolge ist wichtig) -->`). Replace all 24 `<script src="...">` tags with one module tag:

```html
<!-- SCRIPTS -->
<script type="module" src="js/app.js?v=1"></script>
```

- [ ] **Update the cache-bust comment** to reflect the new single-file versioning:

```html
<!-- Cache-Bust: increment ?v= in app.js src after each deployment -->
```

#### `admin.html`

- [ ] **Find the 4 script tags at the top** (`pb.js`, `config.js`, `pdf.js`, `emailLog.js`). Remove them.

- [ ] **In the inline `<script>` block** (around line 828): Remove the duplicate utility stubs (`getVal`, `isPending`, `esc`, `showToast`, `openModal`, `closeModal`). These are now provided by the module system via `admin-app.js`. Keep only the admin-specific state variables that aren't in the module state (`activePlanId`, etc.) and the admin-specific event handlers.

- [ ] **Add the module entry point** before the inline script:

```html
<script type="module" src="js/admin-app.js?v=1"></script>
```

---

### Task 14: Smoke Test and Commit Phase 2

- [ ] **Start local server:**

```bash
cd /Users/marcohoch/Library/CloudStorage/Dropbox/Incomming/github/Crewplaner
python3 -m http.server 8080
```

Open `http://localhost:8080` in browser.

- [ ] **Check DevTools → Network:** You should see `app.js` loading, then individual module files (not 24 script tags). No 404 errors.

- [ ] **Smoke test checklist:**
  - [ ] Login as manager (`madmaxmail@web.de`) — redirects to app
  - [ ] Tour table renders with correct data
  - [ ] Click a crew slot → dropdown opens
  - [ ] Admin console (`admin.html`) opens without errors
  - [ ] Email log tab loads in admin console
  - [ ] `bundle.js` request does NOT appear in Network tab

- [ ] **Check DevTools → Console:** No `Uncaught ReferenceError` errors.

- [ ] **Commit:**

```bash
git add js/ index.html admin.html
git rm js/bundle.js  # if not already removed
git commit -m "feat: ES6 module migration — single entry point, bundle.js deleted, 6 dead files removed"
```

- [ ] **Deploy and verify live:**

```bash
git push origin main
```

Open `https://crewplanner.nyxlightwork.de` — verify login and table render work.

---

## Phase 3: State Reform

> Replace direct global state mutations with getter/setter functions in `state.js`. Fixes the `cancelProposal` stale-state bug. All callers import and use setters instead of mutating exported `let` variables directly.

---

### Task 15: Rewrite `state.js` with Getter/Setter API

**Files:** Modify `js/state.js`

This is a full rewrite. Keep all the existing constant values (OFFEN, DE_DAYS, etc.) and default data arrays. Replace `export let` mutable vars with private `let` vars + exported getter/setter functions.

- [ ] **Rewrite `js/state.js`** — keep all `export let` bindings from Phase 2 (so all existing read access remains unchanged), but add setter functions as the ONLY allowed write path. Callers still read `IS_MANAGER`, `assignments[date][posId]`, etc. directly — only writes go through setters.

Replace `js/state.js` with:

```js
// ── Constants (unchanged from Phase 2) ───────────────────────────────────────
export const OFFEN     = '__offen__';
// ... all other constants unchanged

// ── Mutable State (exported for reading only — write via setters below) ───────
export let POSITIONS = [ /* default data */ ];
export let crew = [ /* defaults */ ];
export let defaultCrew = {};
export let assignments  = {};
export let logos = {booking:'', band:'', planer:''};
export let crewMeta = {};
export let assignmentStatuses = {};
export let TOUR_DATES = [ /* 57 entries */ ];
export let USER_ROLE     = 'crew';
export let IS_SUPERADMIN = false;
export let IS_MANAGER    = false;
export let IS_BOOKER     = false;
export let IS_CREW       = false;
export let IS_ADMIN      = false;
export let CURRENT_USER_ID = null;
export let CURRENT_USER_EMAIL = null;

// ── Setters ────────────────────────────────────────────────────────────────────
export function setAssignment(date, posId, value) {
  if (!assignments[date]) assignments[date] = {};
  assignments[date][posId] = value;
}
export function clearAssignmentSlot(date, posId) {
  if (assignments[date]) delete assignments[date][posId];
}
export function loadAssignmentsData(data) { assignments = data || {}; }

export function setStatus(date, posId, statusObj) {
  if (!assignmentStatuses[date]) assignmentStatuses[date] = {};
  assignmentStatuses[date][posId] = statusObj;
}
export function clearStatus(date, posId) {
  if (assignmentStatuses[date]) delete assignmentStatuses[date][posId];
}
export function loadStatusesData(data) { assignmentStatuses = data || {}; }

export function setTourDates(dates) { TOUR_DATES = [...dates]; }
export function pushTourDate(row) { TOUR_DATES.push(row); }
export function spliceTourDate(index, count) { TOUR_DATES.splice(index, count); }

export function setPositions(positions) { POSITIONS = [...positions]; }
export function setCrew(crewArray) { crew = [...crewArray]; }
export function setDefaultCrew(dc) { defaultCrew = { ...dc }; }
export function setCrewMeta(meta) { crewMeta = { ...meta }; }
export function setLogos(l) { logos = { ...l }; }

export function setAuthState(userId, email, role) {
  CURRENT_USER_ID    = userId;
  CURRENT_USER_EMAIL = email;
  USER_ROLE          = role;
  IS_SUPERADMIN      = role === 'superadmin';
  IS_MANAGER         = role === 'manager' || IS_SUPERADMIN;
  IS_BOOKER          = role === 'booker';
  IS_CREW            = role === 'crew';
  IS_ADMIN           = IS_MANAGER;
}
export function clearAuthState() {
  CURRENT_USER_ID = null; CURRENT_USER_EMAIL = null; USER_ROLE = 'crew';
  IS_SUPERADMIN = false; IS_MANAGER = false; IS_BOOKER = false; IS_CREW = false; IS_ADMIN = false;
}
```

**Key benefit:** All callers can still read `IS_MANAGER`, `assignments[date][posId]`, etc. as they did before. Only the write operations change. This minimizes the number of callers that need updating.

**Remove** the temporary `_setAuthState` function added to `state.js` in Task 8.

---

### Task 16: Fix `cancelProposal` Stale-State Bug in `dataService.js`

**Files:** Modify `js/dataService.js`

**Problem:** After deleting a PocketBase `assignments` record, the in-memory `assignmentStatuses[date][posId]` entry is not cleared. The cell stays yellow/red until the next full reload.

- [ ] **Import `clearStatus` at top of `dataService.js`** (already imported in the `state.js` import block — just add `clearStatus` and `clearAssignmentSlot` to the existing import list):

```js
import {
  // ... existing imports ...
  clearStatus,
  clearAssignmentSlot,
  loadAssignmentsData,
  loadStatusesData,
  setStatus,
  setTourDates,
  setPositions,
  setCrew,
  setDefaultCrew,
  setCrewMeta,
  setLogos,
  setAuthState
} from './state.js';
```

- [ ] **Fix `cancelProposal`** — add `clearStatus` call after successful delete:

```js
async function cancelProposal(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
    if (existing) {
      await pbDelete('/api/collections/assignments/records/' + existing.id);
      clearStatus(dateStr, posId);   // ← NEW: fix stale state
    }
  } catch(e) {
    console.warn('cancelProposal Fehler:', e.message);
    throw e;
  }
}
```

- [ ] **Fix `bulkCancelProposals`** — add `clearStatus` for each deleted record:

```js
async function bulkCancelProposals(posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  try {
    const data = await pbList('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && pos_id = "${pbEscapeFilter(posId)}" && (status = "proposed" || status = "declined")`);
    await Promise.all((data?.items || []).map(row => {
      clearStatus(row.date, row.pos_id);   // ← NEW: fix stale state
      return pbDelete('/api/collections/assignments/records/' + row.id);
    }));
  } catch(e) {
    console.warn('bulkCancelProposals Fehler:', e.message);
    throw e;
  }
}
```

- [ ] **Update `loadAssignmentStatuses`** to use `loadStatusesData`:

```js
// Find the section that clears assignmentStatuses and rebuilds it:
// BEFORE:
Object.keys(assignmentStatuses).forEach(k => delete assignmentStatuses[k]);
// ...
if (!assignmentStatuses[row.date]) assignmentStatuses[row.date] = {};
assignmentStatuses[row.date][row.pos_id] = { ... };

// AFTER:
const newStatuses = {};
// ...
if (!newStatuses[row.date]) newStatuses[row.date] = {};
newStatuses[row.date][row.pos_id] = { ... };
loadStatusesData(newStatuses);
```

- [ ] **Update plan-load functions** (`loadPlanForCrew`, `loadPlanForManager`) to use setters:

```js
// BEFORE:
TOUR_DATES.length = 0;
data.tourDates.forEach(d => TOUR_DATES.push(d));
POSITIONS.length = 0;
data.positions.forEach(p => POSITIONS.push(p));
// etc.

// AFTER:
setTourDates(data.tourDates || []);
setPositions(data.positions || []);
setCrew(data.crew || []);
setDefaultCrew(data.defaultCrew || {});
```

---

### Task 17: Fix 5 Direct State Mutations in `userView.js`

**Files:** Modify `js/userView.js`

- [ ] **Add `setStatus` and `clearStatus` to the import from `state.js`:**

```js
import { ..., assignmentStatuses, setStatus } from './state.js';
```

- [ ] **Replace the 5 direct `assignmentStatuses` mutations** with `setStatus` calls:

**Line ~29 (decline single slot):**
```js
// BEFORE:
if (assignmentStatuses[dateStr]?.[posId]) assignmentStatuses[dateStr][posId].status = 'declined';
// AFTER:
const _si29 = assignmentStatuses[dateStr]?.[posId];
if (_si29) setStatus(dateStr, posId, { ..._si29, status: 'declined' });
```

**Lines ~164-165 (bulk confirm/decline):**
```js
// BEFORE:
if (assignmentStatuses[d.date]?.[d.posId]) {
  assignmentStatuses[d.date][d.posId].status = d.confirmed ? 'confirmed' : 'declined';
}
// AFTER:
const _si165 = assignmentStatuses[d.date]?.[d.posId];
if (_si165) setStatus(d.date, d.posId, { ..._si165, status: d.confirmed ? 'confirmed' : 'declined' });
```

**Line ~201 (bulk confirm all):**
```js
// BEFORE:
slots.forEach(s => { if (assignmentStatuses[s.date]?.[s.posId]) assignmentStatuses[s.date][s.posId].status = 'confirmed'; });
// AFTER:
slots.forEach(s => {
  const _si = assignmentStatuses[s.date]?.[s.posId];
  if (_si) setStatus(s.date, s.posId, { ..._si, status: 'confirmed' });
});
```

**Line ~213 (bulk decline all):**
```js
// BEFORE:
slots.forEach(s => { if (assignmentStatuses[s.date]?.[s.posId]) assignmentStatuses[s.date][s.posId].status = 'declined'; });
// AFTER:
slots.forEach(s => {
  const _si = assignmentStatuses[s.date]?.[s.posId];
  if (_si) setStatus(s.date, s.posId, { ..._si, status: 'declined' });
});
```

**Line ~287 (re-propose after cancel):**
```js
// BEFORE:
assignmentStatuses[dateStr][posId] = { ...si, status: 'proposed' };
// AFTER:
setStatus(dateStr, posId, { ...si, status: 'proposed' });
```

---

### Task 18: Update `dropdown.js` and `persistence.js` for State Setters

**Files:** Modify `js/dropdown.js`, modify `js/persistence.js`

#### `dropdown.js`

- [ ] **Add `setAssignment`, `clearAssignmentSlot` to import from `state.js`.**

- [ ] **Replace direct `assignments[date][posId] = value` writes** with `setAssignment(date, posId, value)`:

```js
// Find setAssign() function in dropdown.js
// BEFORE:
function setAssign(dateStr, posId, val) {
  if (!assignments[dateStr]) assignments[dateStr] = {};
  assignments[dateStr][posId] = val;
  // ...
}
// AFTER:
function setAssign(dateStr, posId, val) {
  setAssignment(dateStr, posId, val);
  // ...
}
```

- [ ] **Replace `delete assignments[dateStr][posId]`** with `clearAssignmentSlot(dateStr, posId)`.

#### `persistence.js`

- [ ] **Add `loadAssignmentsData`, `setTourDates`, `setPositions`, `setCrew`, `setDefaultCrew`, `setLogos` to import from `state.js`.**

- [ ] **Replace bulk state resets** in `_loadPlanFromLS` with setter calls:

```js
// BEFORE (typical pattern in persistence.js):
TOUR_DATES.length = 0;
(data.tourDates||[]).forEach(d => TOUR_DATES.push(d));
POSITIONS.length = 0;
(data.positions||[]).forEach(p => POSITIONS.push(p));

// AFTER:
setTourDates(data.tourDates || []);
setPositions(data.positions || []);
setCrew(data.crew || []);
setDefaultCrew(data.defaultCrew || {});
```

---

### Task 19: Commit Phase 3 and Full Regression Test

- [ ] **Start local server and run full workflow test:**

```bash
python3 -m http.server 8080
```

Test these flows in order:
1. Login as manager → tour table renders
2. Assign a crew member to a slot → slot shows name immediately
3. Click "Einladen" for a crew member → proposed (yellow ⏳) appears
4. Click the cancel button on a proposed slot → slot clears immediately (**this is the bug fix** — verify no stale yellow cell)
5. Login as crew member → see "Bitte bestätigen" on proposed slots
6. Confirm a slot → cell turns green ✓
7. Open admin console → email log loads

- [ ] **Check for stale state bug fix specifically:**

After cancelling a proposal (step 4), open browser DevTools → Console and run:
```js
import('./js/state.js').then(s => console.log(s.getStatuses()))
```
The cancelled slot's date/posId key should be absent from the result.

- [ ] **Update version in 4 files** (ask user for version number first):

Files to update: `index.html`, `admin.html`, `CLAUDE.md`, `README.md`

- [ ] **Commit:**

```bash
git add js/ index.html admin.html CLAUDE.md README.md
git commit -m "refactor: State Reform — centralized setters, cancelProposal stale-state fix, 5 userView mutations replaced"
```

- [ ] **Deploy:**

```bash
git push origin main
```

Verify on `https://crewplanner.nyxlightwork.de` — full smoke test: login, table render, slot assignment, cancel proposal (verify no stale state), crew confirmation flow.

---

## Self-Review Notes

- Phase 1 is independently deployable after Task 4 — do not wait for Phase 2 to push the security fixes.
- Phase 2, Task 8 introduces `_setAuthState` as a temporary bridge function in `state.js`. Task 15 replaces it with the proper `setAuthState` export. Ensure the `_setAuthState` name is removed from `authService.js` when upgrading to `setAuthState`.
- `admin.html` has an inline `<script>` with its own `getVal`, `isPending`, `esc` stub implementations that differ slightly from the `utils.js` versions (notably `getVal` in admin uses `si.crewName` as fallback, while the main version does not). Audit these differences during Task 13 before removing the stubs.
- `app.js` imports all modules even if their code isn't directly called from the entry point — this ensures all module-level side effects run (e.g., `types.js` loading custom types from localStorage on import). This is intentional.
