// =============================================================================
// apple-health-ingest  (v5)
// Webhook receiver pro iOS app "Health Auto Export - JSON+CSV" -> Supabase
//
// Auth: hlavicka  x-api-key: <klic>   (verify_jwt = false)
//
// CHANGELOG:
// v3 - spanek: HAE posila inBed/asleep = 0 (ne null) -> dopocitat z fazi
// v4 - raw payload se pred ulozenim ORIZNE (GPS trasa, HR serie).
//      Puvodne 2-12 MB payloady => insert timeout, 500/503.
// v5 - KRITICKE: `source` VYHOZEN z idempotencniho klice.
//      HAE sklada nazev zdroje pokazde jinak:
//        "Watch|iphone|Sports Tracker"  vs  "Watch|iphone" + "iphone"
//      => stejne mereni se ulozilo 2x => denni SOUCTY 2x nadhodnocene.
//      Klic je nyni (user_id, metric_name, measured_at). Source = atribut.
//      Diky "Shrnout udaje" v HAE pripada na jeden usek jedna hodnota.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TZ = 'Europe/Prague';
const CHUNK = 500;

const HEAVY_KEYS = new Set([
  'heartRateData', 'heartRateRecovery', 'route', 'stepCount',
  'walkingAndRunningDistance', 'activeEnergy', 'humidity', 'temperature',
  'speed', 'cadence', 'power', 'elevation', 'swimmingStrokeCount',
  'distance', 'restingHeartRate',
]);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// ---------- helpers ----------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v !== 'string') return null;

  let s = v.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2}):?(\d{2})$/);
  if (m) s = `${m[1]}T${m[2]}${m[3]}:${m[4]}`;
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const localDate = (d: Date) => dayFmt.format(d);

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  if (typeof v === 'object' && 'qty' in (v as Record<string, unknown>)) {
    return num((v as Record<string, unknown>).qty);
  }
  return null;
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k];
  }
  return null;
}

const src = (v: unknown): string =>
  typeof v === 'string' && v.trim() ? v.trim() : '';

function slimWorkout(w: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (Array.isArray(v) && (HEAVY_KEYS.has(k) || v.length > 20)) {
      out[`${k}__count`] = v.length;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function slimPayload(
  metrics: Record<string, unknown>[],
  workouts: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    data: { metrics, workouts: workouts.map(slimWorkout) },
    _slimmed: true,
  };
}

async function upsertChunked(table: string, rows: unknown[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// ---------- parsery ----------------------------------------------------------

interface Ctx { userId: string }

function parseSleep(entries: Record<string, unknown>[], ctx: Ctx) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const h2m = (v: unknown): number | null => {
    const n = num(v);
    if (n === null || n === 0) return null; // HAE posila 0 misto null
    return Math.round(n * 60 * 100) / 100;
  };

  for (const e of entries) {
    const start = parseDate(pick(e, ['sleepStart', 'startDate', 'inBedStart', 'date']));
    if (!start) continue;
    const end = parseDate(pick(e, ['sleepEnd', 'endDate', 'inBedEnd']));

    const core = h2m(e.core);
    const deep = h2m(e.deep);
    const rem = h2m(e.rem);
    const awake = h2m(e.awake);

    const phaseSum =
      core !== null || deep !== null || rem !== null
        ? Math.round(((core ?? 0) + (deep ?? 0) + (rem ?? 0)) * 100) / 100
        : null;

    const asleep = h2m(pick(e, ['asleep', 'totalSleep'])) ?? phaseSum;

    let inBed = h2m(e.inBed);
    if (inBed === null && end) {
      const windowMin = (end.getTime() - start.getTime()) / 60000;
      if (windowMin > 0) inBed = Math.round(windowMin * 100) / 100;
    }

    const efficiency =
      inBed !== null && inBed > 0 && asleep !== null && asleep > 0
        ? Math.min(100, Math.round((asleep / inBed) * 10000) / 100)
        : null;

    // KLIC: jen sleep_start (source je nestabilni)
    const key = start.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      user_id: ctx.userId,
      sleep_start: start.toISOString(),
      sleep_end: end?.toISOString() ?? null,
      local_date: localDate(end ?? start),
      in_bed_min: inBed,
      asleep_min: asleep,
      core_min: core,
      deep_min: deep,
      rem_min: rem,
      awake_min: awake,
      efficiency_pct: efficiency,
      source: src(pick(e, ['source', 'sleepSource'])),
      raw: e,
    });
  }
  return rows;
}

function parseMetrics(metrics: Record<string, unknown>[], ctx: Ctx) {
  const metricRows: Record<string, unknown>[] = [];
  const sleepRows: Record<string, unknown>[] = [];
  const seen = new Map<string, number>(); // key -> index v metricRows

  for (const metric of metrics) {
    const name = String(metric.name ?? '').trim();
    if (!name) continue;
    const unit = (metric.units as string) ?? null;
    const data = Array.isArray(metric.data) ? (metric.data as Record<string, unknown>[]) : [];

    if (name === 'sleep_analysis') {
      sleepRows.push(...parseSleep(data, ctx));
      continue;
    }

    for (const d of data) {
      const at = parseDate(d.date);
      if (!at) continue;

      const minV = num(pick(d, ['Min', 'min']));
      const maxV = num(pick(d, ['Max', 'max']));
      const avgV = num(pick(d, ['Avg', 'avg']));
      const qty = num(d.qty) ?? avgV;
      if (qty === null && minV === null && maxV === null) continue;

      const row = {
        user_id: ctx.userId,
        metric_name: name,
        unit,
        measured_at: at.toISOString(),
        local_date: localDate(at),
        qty, min_value: minV, max_value: maxV, avg_value: avgV,
        source: src(d.source),
        raw: d,
      };

      // KLIC BEZ SOURCE. Kdyz v jednom payloadu prijde tentyz klic vickrat
      // (ruzne zdroje), secteme kumulativni hodnotu - to odpovida tomu,
      // co HAE dela pri slucovani zdroju.
      const key = `${name}|${row.measured_at}`;
      const existingIdx = seen.get(key);
      if (existingIdx === undefined) {
        seen.set(key, metricRows.length);
        metricRows.push(row);
      } else {
        const prev = metricRows[existingIdx] as typeof row;
        prev.qty = (prev.qty ?? 0) + (row.qty ?? 0);
        prev.min_value = prev.min_value !== null && row.min_value !== null
          ? Math.min(prev.min_value, row.min_value) : (prev.min_value ?? row.min_value);
        prev.max_value = prev.max_value !== null && row.max_value !== null
          ? Math.max(prev.max_value, row.max_value) : (prev.max_value ?? row.max_value);
        if (row.source && !prev.source.includes(row.source)) {
          prev.source = prev.source ? `${prev.source}|${row.source}` : row.source;
        }
      }
    }
  }
  return { metricRows, sleepRows };
}

function parseWorkouts(workouts: Record<string, unknown>[], ctx: Ctx) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const kcal = (v: unknown): number | null => {
    const n = num(v);
    if (n === null) return null;
    const u = v && typeof v === 'object'
      ? String((v as Record<string, unknown>).units ?? '').toLowerCase() : '';
    return u === 'kj' ? Math.round((n / 4.184) * 100) / 100 : n;
  };

  for (const w of workouts) {
    const start = parseDate(pick(w, ['start', 'startDate']));
    if (!start) continue;
    const end = parseDate(pick(w, ['end', 'endDate']));

    const externalId =
      (pick(w, ['id', 'uuid']) as string) ??
      `${String(pick(w, ['name', 'workoutActivityType']) ?? 'workout')}-${start.toISOString()}`;

    if (seen.has(externalId)) continue;
    seen.add(externalId);

    let durationS = num(pick(w, ['duration', 'durationSeconds']));
    if (durationS === null && end) durationS = (end.getTime() - start.getTime()) / 1000;
    if (durationS !== null && end && durationS > 0) {
      const realS = (end.getTime() - start.getTime()) / 1000;
      if (realS > 0 && Math.abs(durationS * 60 - realS) < Math.abs(durationS - realS)) {
        durationS = durationS * 60;
      }
    }

    const distRaw = pick(w, ['distance', 'totalDistance', 'walkingAndRunningDistance', 'swimmingDistance']);
    let distanceM: number | null = null;
    let distUnits = '';
    if (Array.isArray(distRaw)) {
      distanceM = (distRaw as Record<string, unknown>[])
        .reduce((acc, d) => acc + (num(d.qty) ?? 0), 0) || null;
      distUnits = String((distRaw as Record<string, unknown>[])[0]?.units ?? '').toLowerCase();
    } else {
      distanceM = num(distRaw);
      distUnits = distRaw && typeof distRaw === 'object'
        ? String((distRaw as Record<string, unknown>).units ?? '').toLowerCase() : '';
    }
    if (distanceM !== null) {
      if (distUnits === 'km' || distUnits === 'kilometers') distanceM *= 1000;
      else if (distUnits === 'mi' || distUnits === 'miles') distanceM *= 1609.344;
      else if (distUnits === 'yd' || distUnits === 'yards') distanceM *= 0.9144;
    }

    rows.push({
      user_id: ctx.userId,
      external_id: externalId,
      workout_type: (pick(w, ['name', 'workoutActivityType', 'type']) as string) ?? null,
      started_at: start.toISOString(),
      ended_at: end?.toISOString() ?? null,
      local_date: localDate(start),
      duration_s: durationS,
      active_kcal: kcal(pick(w, ['activeEnergyBurned', 'activeEnergy'])),
      total_kcal: kcal(pick(w, ['totalEnergyBurned', 'totalEnergy'])),
      distance_m: distanceM,
      avg_hr: num(pick(w, ['avgHeartRate', 'averageHeartRate'])),
      max_hr: num(pick(w, ['maxHeartRate'])),
      elevation_m: num(pick(w, ['elevationUp', 'elevation'])),
      source: src(pick(w, ['source', 'device'])),
      raw: slimWorkout(w),
    });
  }
  return rows;
}

// ---------- handler ----------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') return json({ ok: true, service: 'apple-health-ingest', version: 5 });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (!apiKey || apiKey.length < 20) return json({ error: 'missing_api_key' }, 401);

  const keyHash = await sha256Hex(apiKey);
  const { data: conn, error: connErr } = await supabase
    .from('apple_health_connections')
    .select('id, user_id, status, sync_count')
    .eq('api_key_hash', keyHash)
    .eq('status', 'active')
    .maybeSingle();

  if (connErr) {
    console.error('conn_lookup_failed', connErr.message);
    return json({ error: 'internal' }, 500);
  }
  if (!conn) return json({ error: 'invalid_api_key' }, 401);

  const ctx: Ctx = { userId: conn.user_id };

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return json({ error: 'unreadable_body' }, 400);
  }
  const originalBytes = bodyText.length;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  bodyText = '';

  const root = (payload.data ?? payload) as Record<string, unknown>;
  const metricsIn = Array.isArray(root.metrics) ? (root.metrics as Record<string, unknown>[]) : [];
  const workoutsIn = Array.isArray(root.workouts) ? (root.workouts as Record<string, unknown>[]) : [];

  const { data: rawRow, error: rawErr } = await supabase
    .from('apple_health_raw_payloads')
    .insert({
      user_id: ctx.userId,
      connection_id: conn.id,
      byte_size: originalBytes,
      payload: slimPayload(metricsIn, workoutsIn),
      metrics_count: metricsIn.length,
      workouts_count: workoutsIn.length,
    })
    .select('id')
    .single();

  if (rawErr) {
    console.error('raw_insert_failed', rawErr.message, 'bytes=', originalBytes);
    return json({ error: 'raw_insert_failed', detail: rawErr.message }, 500);
  }

  try {
    const { metricRows, sleepRows } = parseMetrics(metricsIn, ctx);
    const workoutRows = parseWorkouts(workoutsIn, ctx);

    // *** v5: onConflict BEZ source ***
    if (metricRows.length) {
      await upsertChunked('apple_health_metrics', metricRows, 'user_id,metric_name,measured_at');
    }
    if (sleepRows.length) {
      await upsertChunked('apple_health_sleep', sleepRows, 'user_id,sleep_start');
    }
    if (workoutRows.length) {
      await upsertChunked('apple_health_workouts', workoutRows, 'user_id,external_id');
    }

    await supabase.from('apple_health_raw_payloads')
      .update({ processed_at: new Date().toISOString() }).eq('id', rawRow.id);

    await supabase.from('apple_health_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
        sync_count: (conn.sync_count ?? 0) + 1,
      })
      .eq('id', conn.id);

    console.log(
      `ingest ok user=${ctx.userId} metrics=${metricRows.length} sleep=${sleepRows.length} workouts=${workoutRows.length} bytes=${originalBytes}`,
    );

    return json({
      ok: true,
      ingested: { metrics: metricRows.length, sleep: sleepRows.length, workouts: workoutRows.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('processing_failed', msg);

    await supabase.from('apple_health_raw_payloads')
      .update({ process_error: msg }).eq('id', rawRow.id);
    await supabase.from('apple_health_connections')
      .update({ last_sync_error: msg }).eq('id', conn.id);

    return json({ error: 'processing_failed', detail: msg }, 500);
  }
});
