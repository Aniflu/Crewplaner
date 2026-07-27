// ── Pocketbase-Konfiguration ────────────────────────────────────────────────────
import { pickApiUrl } from './pure.js';

// API-URL nach Umgebung (v0.31.0): Test (GitHub Pages) → Test-PocketBase,
// Live (crewplanner.nyxlightwork.de) → Live-PocketBase. Reihenfolge:
//   1. window.POCKETBASE_URL (von den HTML-Kopf-Skripten schon gesetzt) hat Vorrang,
//   2. sonst selbst aus location.hostname bestimmen (z.B. view.html ohne Kopf-Skript),
//   3. Node/Test-Umgebung ohne window/location → Live-URL als harmloser Fallback
//      (fetch ist in den Tests gemockt).
export const POCKETBASE_URL =
  (typeof window !== 'undefined' && window.POCKETBASE_URL) ? window.POCKETBASE_URL
  : (typeof location !== 'undefined' && location.hostname) ? pickApiUrl(location.hostname)
  : 'https://api.crewplanner.nyxlightwork.de';

export const SUPABASE_ENABLED = true;
