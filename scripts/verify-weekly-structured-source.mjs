#!/usr/bin/env node
/**
 * Ověření konzistence weekly source helperu.
 *   node scripts/verify-weekly-structured-source.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const file = readFileSync(resolve(process.cwd(), 'lib/plan/structuredWeekSource.js'), 'utf8');
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const weekBlockMatch = file.match(/export function buildStructuredWeekSource\([\s\S]*?return \{ useStruct, planWeekDays: result, todayWeekIdx, todayWeekDay \};/);
const weekBlock = weekBlockMatch ? weekBlockMatch[0] : '';

check(
  'useStruct uses presence of structDays',
  file.includes('const useStruct = !!(structDays && structDays.length > 0);')
);

check(
  'htmlDay is not resolved when useStruct=true',
  file.includes('const htmlDay = !useStruct && parsedDays.length > 0 ? findDayForDate(parsedDays, origIdx, planFrom) : null;')
);

check(
  'meals do not fall back to htmlDay.meals under useStruct',
  /const meals = structMeals && structMeals\.length > 0[\s\S]*?: useStruct[\s\S]*?\? \[\][\s\S]*?: htmlDay\?\.meals \|\| \[\];/.test(weekBlock)
);

check(
  'missing structured day sets placeholder true',
  file.includes('_placeholder: useStruct ? !structDay : !!(htmlDay?._placeholder),')
);

check(
  'weekly card does not spread htmlDay when useStruct=true',
  file.includes('...(!useStruct && htmlDay ? htmlDay : {}),')
);

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
