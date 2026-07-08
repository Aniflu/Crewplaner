// State-/Logik-Tests: laden den echten Modulgraphen headless (Stubs via _setup.mjs).
// Best-effort: lässt sich der Graph nicht laden, werden die Tests als SKIP markiert.
import { test, eq, ok, deepEq } from './_assert.mjs';
import { loadGraph as graph } from './_graph.mjs';

test('isPending: proposed/declined → true, confirmed/assigned/null → false', async () => {
  const g = await graph(); if(!g) return 'SKIP';
  const { isPending } = g.utils;
  ok(isPending({ status:'proposed' }), 'proposed');
  ok(isPending({ status:'declined' }), 'declined');
  ok(!isPending({ status:'confirmed' }), 'confirmed');
  ok(!isPending({ status:'assigned' }), 'assigned');
  ok(!isPending(null), 'null');
});

test('esc: maskiert " und \' (Attribut-sicher) — Name mit Anführungszeichen bricht value="..." nicht mehr', async () => {
  const g = await graph(); if(!g) return 'SKIP';
  const { esc } = g.utils;
  eq(esc('Robert "Woody" Steinmetz'), 'Robert &quot;Woody&quot; Steinmetz', 'doppelte Quotes escaped');
  eq(esc("O'Brien"), 'O&#39;Brien', 'einfache Quotes escaped');
  eq(esc('<b> & "x"'), '&lt;b&gt; &amp; &quot;x&quot;', '<, >, &, " zusammen');
  eq(esc(null), '', 'null → leer');
});

test('getVal: assignments-Override hat Vorrang vor defaultCrew', async () => {
  const g = await graph(); if(!g) return 'SKIP';
  const { assignments, defaultCrew } = g.state;
  const { getVal } = g.utils;
  Object.keys(assignments).forEach(k => delete assignments[k]);
  Object.keys(defaultCrew).forEach(k => delete defaultCrew[k]);
  defaultCrew['gl'] = 'Marco';
  eq(getVal('2026-07-01','gl'), 'Marco', 'ohne Override → defaultCrew');
  assignments['2026-07-01'] = { gl:'Oliver' };
  eq(getVal('2026-07-01','gl'), 'Oliver', 'mit Override → assignment');
  assignments['2026-07-01'] = { gl:'' };
  eq(getVal('2026-07-01','gl'), '', 'leerer Override → leer (nicht default)');
});

test('sortInsert: hält TOUR_DATES nach Datum sortiert', async () => {
  const g = await graph(); if(!g) return 'SKIP';
  const { TOUR_DATES } = g.state;
  const { sortInsert } = g.utils;
  TOUR_DATES.length = 0;
  sortInsert({ date:'2026-07-03' });
  sortInsert({ date:'2026-07-01' });
  sortInsert({ date:'2026-07-02' });
  deepEq(TOUR_DATES.map(r => r.date), ['2026-07-01','2026-07-02','2026-07-03']);
});

test('typeFromLabel: Standard-Labels → korrekter Typ', async () => {
  const g = await graph(); if(!g) return 'SKIP';
  const { typeFromLabel } = g.types;
  eq(typeFromLabel('Show'), 'show', 'Show');
  eq(typeFromLabel('Reise'), 'reise', 'Reise');
  eq(typeFromLabel('OFF'), 'off', 'OFF');
});
