// Guard: view-app.js muss den Render-State über die state.js-Setter befüllen,
// NICHT über window.* — sonst bleiben in der öffentlichen Ansicht (view.html) die
// Besetzungszellen leer und der Kopf zeigt die Default-Positionen (Bug v0.27.1:
// „öffentlicher Link leer"). render.js/utils.js lesen die ES-Modul-Bindings.
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/view-app.js'), 'utf8');

test('view-app.js befüllt den State über state.js-Setter', () => {
  for (const setter of ['setCrew', 'setPositions', 'setTourDates',
                        'loadAssignmentsData', 'setDefaultCrew', 'loadStatusesData']) {
    ok(new RegExp(setter + '\\s*\\(').test(src), 'ruft ' + setter + '(...) auf');
  }
});

test('view-app.js weist Render-Daten NICHT window.* zu (wirkungslos für den Render)', () => {
  for (const g of ['assignments', 'defaultCrew', 'POSITIONS', 'crew', 'assignmentStatuses']) {
    ok(!new RegExp('window\\.' + g + '\\s*=').test(src),
       'keine window.' + g + '=-Zuweisung');
  }
});
