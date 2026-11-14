// E-Mail-Log (Admin): jeder vom Hook geschriebene Typ hat ein Label, übersprungene Zeilen sind filterbar.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/emailLog.js'), 'utf8');

test('E-Mail-Log: Typen crew_changes und pencil_info haben Label und Dropdown-Eintrag', () => {
  for (const t of ['crew_changes', 'pencil_info']) {
    ok(new RegExp(t + ":\\s*'").test(src), 'Label ' + t);
    ok(src.includes('<option value="' + t + '">'), 'Dropdown ' + t);
  }
});
test('E-Mail-Log: Statusfilter „skipped“ (Test – nicht versendet), „ok“ bleibt nur success===true', () => {
  ok(src.includes("_setEmailLogStatus('skipped')") && src.includes('id="elStatusSkipped"'), 'Knopf');
  ok(src.includes("status === 'skipped' && rec.success !== 'skipped'"), 'Filter');
  ok(src.includes("status === 'ok'   && rec.success !== 'true'"), 'ok unverändert');
  ok(src.includes("getElementById('elStatusSkipped').style"), 'Knopf wird beim Umschalten gestylt');
});
