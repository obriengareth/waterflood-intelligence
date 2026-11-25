import type { Dashboard } from './context';

export const staticMode = import.meta.env.VITE_STATIC === 'true';
export const baseUrl = import.meta.env.BASE_URL;
type Tag = { well_id: string; minute_offset: number; [key: string]: string | number | null };
export type Playback = { state: 'idle' | 'running' | 'paused' | 'completed'; running: boolean; step: number; total_steps: number;
  interval_seconds: number; source_interval_seconds: number; remaining_seconds: number; run_id: string | null; wells_per_step: number };
type WellPack = Pick<Dashboard, 'completion' | 'tops' | 'realtime' | 'recent_realtime' | 'well_history' | 'well_tests' | 'pvt' | 'trend'>;
type Geology = { wells: { name: string; field: string; reservoir: string; type: string }[];
  surfaces: { field: string }[]; [key: string]: unknown };
const requests = new Map<string, Promise<unknown>>();
async function json<T>(file: string): Promise<T> {
  if (!requests.has(file)) requests.set(file, fetch(`${baseUrl}data/${file}`).then(async response => {
    if (!response.ok) throw new Error(`Published source unavailable: ${file} (${response.status})`);
    return response.json();
  }));
  return requests.get(file) as Promise<T>;
}
let csv: Promise<Map<string, Tag[]>> | undefined;
async function rows() {
  return csv ||= fetch(`${baseUrl}data/playback.csv`).then(async response => {
    if (!response.ok) throw new Error(`Playback CSV unavailable (${response.status})`);
    const [header, ...lines] = (await response.text()).trim().split(/\r?\n/);
    const columns = header.split(','), result = new Map<string, Tag[]>();
    for (const line of lines) {
      const values = line.split(',');
      const row = Object.fromEntries(columns.map((key, index) => [key, index === 0 ? values[index] : values[index] === '' ? null : Number(values[index])])) as Tag;
      if (!result.has(row.well_id)) result.set(row.well_id, []);
      result.get(row.well_id)!.push(row);
    }
    if (result.size !== 100 || [...result.values()].some(list => list.length !== 120)) throw new Error('Published playback must contain 120 records for each of 100 wells');
    return result;
  });
}
let step = 0, phase: Playback['state'] = 'idle', timer: ReturnType<typeof setTimeout> | undefined;
let anchor = Date.now(), timeline = anchor, run: string | null = null, deadline = 0;
const listeners = new Set<(status: Playback) => void>();
export function playbackStatus(): Playback {
  return { state: phase, running: phase === 'running', step, total_steps: 120, interval_seconds: 5,
    source_interval_seconds: 60, remaining_seconds: (120 - step) * 5, run_id: run, wells_per_step: 100 };
}
function notify() { for (const listener of listeners) listener(playbackStatus()); }
export function subscribePlayback(listener: (status: Playback) => void) {
  listeners.add(listener); listener(playbackStatus());
  return () => { listeners.delete(listener); };
}
function schedule() {
  timer = setTimeout(() => {
    step++; timeline = anchor + step * 60000;
    if (step === 120) { phase = 'completed'; timer = undefined; }
    else { deadline += 5000; schedule(); }
    notify();
  }, Math.max(0, deadline - Date.now()));
}
async function control(action: string) {
  await rows();
  if (action === 'stop') {
    clearTimeout(timer); timer = undefined;
    if (phase === 'running') phase = 'paused';
  } else if (action === 'start' || action === 'restart') {
    if (action === 'restart' || phase === 'completed' || phase === 'idle') {
      clearTimeout(timer); timer = undefined; step = 0;
      anchor = Math.max(Date.now(), timeline); run = crypto.randomUUID();
    }
    if (phase !== 'running' || action === 'restart') {
      phase = 'running'; deadline = Date.now() + 5000; schedule();
    }
  } else throw new Error(`Unknown playback action: ${action}`);
  notify(); return playbackStatus();
}
const tagKeys = { wct: 'water_cut_pct', liquid: 'liquid_rate_bpd', oil: 'oil_rate_bopd', gor: 'gor_scf_stb',
  whp: 'whp_psi', bhp: 'bhp_pdg_psi', esp_frequency: 'esp_freq_hz', esp_current: 'esp_current_a',
  esp_pip: 'esp_pip_psi', whip: 'whip_psi', injection: 'inj_rate_bwpd' } as const;
function matches(well: { field: string; reservoir: string; type: string }, params: URLSearchParams) {
  return ['field', 'reservoir', 'well_type'].every(key => !params.get(key) || params.get(key) === 'all' ||
    params.get(key) === well[key === 'well_type' ? 'type' : key as 'field' | 'reservoir']);
}
async function dashboard(params: URLSearchParams): Promise<Dashboard> {
  const [source, allRows, pvts, prior] = await Promise.all([json<Dashboard>('dashboard.json'), rows(),
    json<Record<string, { bo: number; bw: number; rs: number; bg: number }>>('pvt.json'),
    json<{ well_id: string; oil_rate_bopd: number; water_rate_bwpd: number; gas_rate_mscfd: number; inj_rate_bwpd: number; hours_on: number }[]>('prior.json')]);
  const data = structuredClone(source);
  data.available_fields = source.fields;
  const wells = source.wells.filter(well => matches(well, params));
  if (!wells.length) throw new Error('No wells match this context');
  const name = params.get('well') || (wells.some(w => w.name === 'RA-0417') ? 'RA-0417' : wells[0].name);
  if (!wells.some(well => well.name === name)) throw new Error('Selected well does not belong to this context');
  const pattern = source.patterns.find(p => p.id === wells.find(w => w.name === name)!.pattern)!;
  const producer = wells.find(w => w.name === name)!.type === 'producer' ? name : pattern.producers[0];
  const [pack, producerPack, injectorPack] = await Promise.all([json<WellPack>(`well-${name}.json`),
    json<WellPack>(`well-${producer}.json`), json<WellPack>(`well-${pattern.injector}.json`)]);
  Object.assign(data, structuredClone(pack));
  const current = (id: string) => allRows.get(id)![step ? step - 1 : 119];
  const number = (id: string, key: string) => Number(current(id)[key] || 0);
  data.wells = wells.map(well => ({ ...well, oil_bopd: number(well.name, 'oil_rate_bopd'),
    water_bwpd: number(well.name, 'water_rate_bwpd'), inj_bwpd: number(well.name, 'inj_rate_bwpd'),
    bhp_psi: number(well.name, 'bhp_pdg_psi'), whip_psi: number(well.name, 'whip_psi'),
    water_cut_pct: current(well.name).water_cut_pct as number | null }));
  data.selected = data.wells.find(well => well.name === name)!;
  const voidage = (id: string) => {
    const well = source.wells.find(w => w.name === id)!, pvt = pvts[well.pvt_region];
    return number(id, 'oil_rate_bopd') * pvt.bo + number(id, 'water_rate_bwpd') * pvt.bw +
      number(id, 'oil_rate_bopd') * Math.max(number(id, 'gor_scf_stb') - pvt.rs, 0) * pvt.bg;
  };
  const totals = (selected: typeof wells) => {
    const oil = selected.reduce((sum, w) => sum + number(w.name, 'oil_rate_bopd'), 0);
    const water = selected.reduce((sum, w) => sum + number(w.name, 'water_rate_bwpd'), 0);
    const injection = selected.reduce((sum, w) => sum + number(w.name, 'inj_rate_bwpd'), 0);
    const volume = selected.reduce((sum, w) => sum + voidage(w.name), 0);
    const injectedVolume = selected.reduce((sum, w) => sum + number(w.name, 'inj_rate_bwpd') * pvts[w.pvt_region].bw, 0);
    return { oil_bopd: oil, water_bwpd: water, inj_bwpd: injection, water_cut_pct: oil + water ? water / (oil + water) * 100 : 0,
      vrr: volume ? injectedVolume / volume : 0 };
  };
  data.fields = source.fields.filter(field => wells.some(w => w.field === field.name)).map(field => {
    const selected = wells.filter(w => w.field === field.name);
    return { ...field, ...totals(selected), producers: selected.filter(w => w.type === 'producer').length,
      injectors: selected.filter(w => w.type === 'injector').length };
  });
  Object.assign(data.metrics, totals(wells), { online: wells.length });
  const previous = prior.filter(row => wells.some(well => well.name === row.well_id));
  const previousOil = previous.reduce((sum, row) => sum + row.oil_rate_bopd, 0);
  const previousWater = previous.reduce((sum, row) => sum + row.water_rate_bwpd, 0);
  let previousVoidage = 0, previousInjectionVolume = 0;
  for (const row of previous) {
    const fluid = pvts[source.wells.find(well => well.name === row.well_id)!.pvt_region];
    previousVoidage += row.oil_rate_bopd * fluid.bo + row.water_rate_bwpd * fluid.bw +
      Math.max(row.gas_rate_mscfd * 1000 - row.oil_rate_bopd * fluid.rs, 0) * fluid.bg;
    previousInjectionVolume += row.inj_rate_bwpd * fluid.bw;
  }
  Object.assign(data.metrics, { prior_oil_bopd: previousOil, prior_inj_bwpd: previous.reduce((sum, row) => sum + row.inj_rate_bwpd, 0),
    prior_water_cut_pct: previousOil + previousWater ? previousWater / (previousOil + previousWater) * 100 : 0,
    prior_vrr: previousVoidage ? previousInjectionVolume / previousVoidage : 0,
    prior_online: previous.filter(row => row.hours_on > 0).length });
  data.patterns = source.patterns.filter(p => data.fields.some(f => f.name === p.field)).map(p => {
    const selected = source.wells.filter(w => [...p.producers, p.injector].includes(w.name));
    return { ...p, ...totals(selected) };
  });
  const minutes = Number(params.get('window_minutes') || 4320);
  function window(id: string, sourcePack: WellPack, recent: boolean): Dashboard['realtime'] {
    const result = structuredClone(recent || minutes <= 120 ? sourcePack.recent_realtime : sourcePack.realtime);
    const offsets = recent || minutes <= 120 ? Array.from({ length: Math.min(minutes, 120) }, (_, i) => 120 - Math.min(minutes, 120) + i) :
      result.minute.map(m => m - 4200);
    const indexes = offsets.map((offset, i) => ({ offset, i })).filter(({ offset }) => recent || minutes <= 120 || offset >= 120 - minutes);
    result.minute = indexes.map(({ offset }) => offset - indexes[0].offset);
    result.timestamps = indexes.map(({ offset }) => new Date(timeline + (offset - 119) * 60000).toISOString());
    for (const key of Object.keys(tagKeys) as (keyof typeof tagKeys)[]) {
      const tag = tagKeys[key], target = key === 'whip' || key === 'injection' ? pattern.injector : id;
      const history = key === 'whip' || key === 'injection' ? injectorPack : sourcePack;
      const original = recent || minutes <= 120 ? history.recent_realtime : history.realtime;
      result[key] = indexes.map(({ offset, i }) => {
        const index = offset + step;
        if (index >= 0 && index < 120) return Number(allRows.get(target)![index][tag] ?? 0);
        if (index >= 120) return Number(allRows.get(target)![index - 120][tag] ?? 0);
        return original[key][i];
      });
    }
    return result;
  }
  data.realtime = window(name, pack, false);
  data.recent_realtime = window(name, pack, true);
  data.pair = { producer, injector: pattern.injector, realtime: window(producer, producerPack, false),
    recent_realtime: window(producer, producerPack, true) };
  data.events = data.events.filter(event => wells.some(w => w.name === event.well));
  data.metrics.open_alerts = data.events.length;
  data.quality.issues = data.quality.issues.filter(issue => wells.some(w => w.name === issue.well));
  data.runtime = { ...data.runtime, selected_well: name, field: data.selected.field, stream_timestamp: new Date(timeline).toISOString(),
    minutes, filter_field: params.get('field') || 'all', filter_reservoir: params.get('reservoir') || 'all',
    filter_well_type: params.get('well_type') || 'all' };
  return data;
}
export async function staticRequest(url: string, body?: unknown): Promise<unknown> {
  const request = new URL(url, location.origin), path = request.pathname;
  if (path.startsWith('/api/playback/')) return control(path.split('/').pop()!);
  if (body !== undefined) throw new Error('Unavailable on GitHub Pages: this action requires the local Python engineering service.');
  if (path === '/api/dashboard') return dashboard(request.searchParams);
  if (path === '/api/agent/examples') return json('agent.json');
  if (path === '/api/geology') {
    const model = structuredClone(await json<Geology>('geology.json'));
    model.wells = model.wells.filter(w => matches(w, request.searchParams));
    const fields = new Set(model.wells.map(w => w.field));
    model.surfaces = model.surfaces.filter(surface => fields.has(surface.field));
    return model;
  }
  throw new Error(`Unavailable on GitHub Pages: ${path}`);
}
