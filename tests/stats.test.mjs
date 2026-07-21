// calcByPers — Tage zählen NUR bestätigte Slots (confirmed); proposed separat, declined gar nicht.
import { test, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

function scenario(g){
  resetState(g);
  const s = g.state;
  s.POSITIONS.push({ id: 'gl', label: 'GL', short: 'GL' });
  // 3 Show-Tage (Gewicht je 1.0), Pascal überall via defaultCrew platziert
  ['2026-07-01','2026-07-02','2026-07-03'].forEach(d => s.TOUR_DATES.push({ date: d, type: 'show', typeLabel: 'Show' }));
  s.defaultCrew.gl = 'Pascal';
}

test('calcByPers: nur confirmed fließt in total, proposed separat', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  scenario(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'confirmed', crewName: 'Pascal' });
  g.state.setStatus('2026-07-02', 'gl', { status: 'proposed',  crewName: 'Pascal' });
  // Tag 3: kein Status-Record (nur platziert) → zählt NICHT als bestätigt
  const r = g.stats.calcByPers();
  eq(r['Pascal'].total, 1, 'nur 1 bestätigter Tag');
  eq(r['Pascal'].proposed, 2, 'proposed + nur-platziert = 2 angefragt');
});

test('calcByPers: declined zählt nicht in total', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  scenario(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'declined',  crewName: 'Pascal' });
  g.state.setStatus('2026-07-02', 'gl', { status: 'confirmed', crewName: 'Pascal' });
  const r = g.stats.calcByPers();
  eq(r['Pascal'].total, 1, 'declined zählt nicht, nur der confirmed Tag');
});

test('calcByPers: pencilled (v0.29.0) zählt nicht in total — wie proposed geführt', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  scenario(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'pencilled', crewName: 'Pascal' });
  g.state.setStatus('2026-07-02', 'gl', { status: 'confirmed', crewName: 'Pascal' });
  const r = g.stats.calcByPers();
  eq(r['Pascal'].total, 1, 'nur der confirmed Tag zählt, pencilled nicht');
});

test('calcByPers: alle unbestätigt → total 0', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  scenario(g);
  const r = g.stats.calcByPers();
  eq(r['Pascal'].total, 0, 'ohne Bestätigung keine Tage');
  eq(r['Pascal'].proposed, 3, 'alle 3 als angefragt geführt');
});
