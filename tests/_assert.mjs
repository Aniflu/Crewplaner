// Mini-Test-Framework (kein npm) — registrieren via test(), ausführen via runAll().
const _tests = [];
export function test(name, fn){ _tests.push({ name, fn }); }

export function eq(actual, expected, msg){
  if(actual !== expected)
    throw new Error(`${msg||'eq'} — erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`);
}
export function deepEq(actual, expected, msg){
  if(JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg||'deepEq'} — erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`);
}
export function ok(cond, msg){ if(!cond) throw new Error(msg||'erwartet truthy'); }

export async function runAll(){
  let pass=0, fail=0, skip=0;
  for(const t of _tests){
    try{
      const r = await t.fn();
      if(r === 'SKIP'){ skip++; console.log(`  ⊘ SKIP  ${t.name}`); }
      else { pass++; console.log(`  ✓ ${t.name}`); }
    }catch(e){
      fail++; console.log(`  ✗ ${t.name}\n      ${e.message}`);
    }
  }
  console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped`);
  return fail;
}
