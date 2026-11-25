import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme, Button, Avatar } from '@fluentui/react-components';
import { HomeRegular, MapRegular, CubeRegular, PulseRegular, DatabaseRegular, SparkleRegular, ArrowTrendingRegular, DocumentRegular, FilterRegular, ArrowDownloadRegular, SearchRegular } from '@fluentui/react-icons';
import { DashboardContext, Dashboard, api, navigate, useDashboard } from './context';
import { Overview, Patterns, Well, WellTrends, DigitalTwin, Surveillance, Quality, Card, Chart, Chip, n, lineOption } from './pages';
import type { EChartsOption } from 'echarts';
import './runtime.css';
import { baseUrl, staticMode, subscribePlayback } from './static-runtime';

const navigation = [
  ['operations-overview', 'Operations overview', HomeRegular], ['fields-and-patterns', 'Fields and patterns', MapRegular],
  ['well-360', 'Well 360', CubeRegular], ['well-trends', 'Well trends', ArrowTrendingRegular], ['digital-twin', 'Digital twin', MapRegular], ['live-surveillance', 'Live surveillance', PulseRegular],
  ['data-quality-and-pipelines', 'Data quality and pipelines', DatabaseRegular], ['agent', 'Agent', SparkleRegular],
  ['optimisation', 'Optimisation', ArrowTrendingRegular], ['work-management', 'Work management', DocumentRegular]
] as const;
const initialPage = location.pathname.split('/').pop()?.replace('.html', '').replace('index', 'operations-overview') || 'operations-overview';
type Filters = { field: string; reservoir: string; well_type: string; window_minutes: string; well: string; offset_radius_km: string };
const initial = new URLSearchParams(location.search);
const defaults: Filters = { field: initial.get('field') || 'all', reservoir: initial.get('reservoir') || 'all',
  well_type: initial.get('well_type') || 'all', window_minutes: initial.get('window_minutes') || '4320', well: initial.get('well') || '', offset_radius_km: initial.get('offset_radius_km') || '20' };
type Scenario = { id: string; name: string; status: string; revision: number; data: OptimisationResult };
type OptimisationResult = { status: string; reason?: string; basis: string; changes: { well: string; current_bwpd: number; proposed_bwpd: number; whip_limit_psi: number }[];
  forecast: { days: number[]; base_bopd: number[]; proposed_bopd: number[] }; uplift_day90_bopd: number; runtime_ms: number; uncertainty: string };
type Work = { change_requests: { id: string; status: string; approved_by: string; approved_at: string }[];
  outbox: { id: string; kind: string; destination: string; status: string; created_at: string }[];
  watch_rules: { id: string; well: string; tag: string; operator: string; threshold: number; duration_minutes: number }[];
  audit: { id: number; ts: string; actor: string; action: string; target: string; detail: string }[] };

function Action({ label, perform, disabled = false }: { label: string; perform: () => Promise<unknown>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <><Button disabled={busy || disabled} onClick={async () => { setBusy(true); setError(''); try { await perform(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>{busy ? 'Working…' : label}</Button>{error && <span className="action-error" role="alert">{error}</span>}</>;
}
function StreamClock({ timestamp }: { timestamp?: string }) {
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <span className="stream-time">{clock.toLocaleString('en-GB')}<small>Playback clock {timestamp ? new Date(timestamp).toLocaleTimeString('en-GB') : '—'}</small></span>;
}
type Playback = { state: 'idle' | 'running' | 'paused' | 'completed'; running: boolean; step: number; total_steps: number;
  interval_seconds: number; source_interval_seconds: number; remaining_seconds: number; run_id: string | null; wells_per_step: number };
function PlaybackControls({ status, changed, refresh }: { status: Playback | null; changed: (next: Playback) => void; refresh: () => Promise<void> }) {
  const [now, setNow] = useState(Date.now()), [received, setReceived] = useState(Date.now());
  useEffect(() => { const time = Date.now(); setReceived(time); setNow(time); }, [status]);
  useEffect(() => { if (!status?.running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [status?.running]);
  const remaining = Math.max(0, Math.ceil((status?.remaining_seconds ?? 600) - (status?.running ? (now - received) / 1000 : 0)));
  const control = async (action: string) => { changed(await api<Playback>(`/api/playback/${action}`, {})); await refresh(); };
  return <div className="playback-controls" data-playback-state={status?.state || 'connecting'} data-playback-step={status?.step || 0}>
    <div><strong>{status?.running ? 'All-field CSV playback' : status?.state === 'completed' ? 'Playback complete' : 'Stable source snapshot'}</strong>
      <span>Original interval 60 s · playback every 5 s · all 100 wells · 120 steps / 10 minutes</span></div>
    <div className="playback-progress"><strong>{status?.state === 'completed' ? '00:00' : `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`}</strong>
      <progress max={120} value={status?.step || 0} /><span>{status?.step || 0}/120 · {status?.state || 'connecting'}</span></div>
    <Action label={status?.state === 'paused' ? 'Resume streaming' : 'Start streaming'} disabled={!status || status.running} perform={() => control('start')} />
    <Action label="Stop streaming" disabled={!status?.running} perform={() => control('stop')} />
    <Action label="Restart streaming" disabled={!status} perform={() => control('restart')} />
  </div>;
}
function Approval({ scenario, changed }: { scenario: Scenario; changed: () => void }) {
  const [confirm, setConfirm] = useState(false), [phrase, setPhrase] = useState(''), [comment, setComment] = useState('');
  return <div className="approval-card"><strong>{scenario.name}</strong> <Chip kind={scenario.status === 'Approved' ? 'green' : 'amber'}>{scenario.status}</Chip>
    <p>{scenario.data.basis}</p><table><thead><tr><th>Injector</th><th>Current · bwpd</th><th>Proposed · bwpd</th><th>WHIP limit · psi</th></tr></thead><tbody>{scenario.data.changes.map(c => <tr key={c.well}><td>{c.well}</td><td>{n(c.current_bwpd)}</td><td>{n(c.proposed_bwpd)}</td><td>{n(c.whip_limit_psi)}</td></tr>)}</tbody></table>
    {scenario.status === 'Awaiting approval' && !confirm && <Button appearance="primary" onClick={() => setConfirm(true)}>Review approval</Button>}
    {confirm && scenario.status === 'Awaiting approval' && <div className="approval-confirm"><p>This records a local change request, channel post, work request and watch rules. It does not change any field set point. Review revision {scenario.revision} and type APPROVE.</p>
      <label>Engineering comment<input value={comment} onChange={e => setComment(e.target.value)} /></label>
      <label>Confirmation<input aria-label="Approval confirmation" value={phrase} onChange={e => setPhrase(e.target.value)} /></label>
      {phrase === 'APPROVE' && comment.trim() && <Action label="Approve and record actions" perform={async () => { await api(`/api/scenarios/${scenario.id}/approve`, { revision: scenario.revision, confirmation: phrase, comment }); setConfirm(false); changed(); }} />}
      <Button onClick={() => setConfirm(false)}>Cancel</Button></div>}
  </div>;
}
function Optimisation() {
  const D = useDashboard(), patterns = D.patterns.filter(p => p.field === D.selected.field);
  const [selection, setSelection] = useState(patterns.map(p => p.id)), [lower, setLower] = useState(.7), [upper, setUpper] = useState(1.2), [whip, setWhip] = useState(2150);
  const [water, setWater] = useState(''), [result, setResult] = useState<OptimisationResult | null>(null), [name, setName] = useState('Engineering allocation');
  const [saved, setSaved] = useState<Scenario[]>([]), [compare, setCompare] = useState<string[]>([]);
  const load = useCallback(() => api<Scenario[]>('/api/scenarios').then(setSaved), []);
  useEffect(() => { load().catch(e => setFailure(String(e))); }, [load]);
  const [failure, setFailure] = useState('');
  const constraints = { patterns: selection, water_available: water ? Number(water) : null, vrr_min: lower, vrr_max: upper, max_whip: whip };
  return <div className="runtime-stack"><Card title="What Optimisation does" subtitle="Water-conserving engineering planning · never an automatic field instruction">
    <p>Select allocation patterns and compare how the same total injection water could be redistributed between injectors. The calculation checks voidage replacement ratio (VRR), injector rate limits, wellhead injection pressure (WHIP), and bottom-hole parting limits; incompatible constraints are reported as infeasible.</p>
    <p>VRR compares injected reservoir volume with produced fluid voidage, not just oil rate. Forecast oil uplift uses an uncalibrated marginal-response planning case and Arps decline: it is conditional, not a reservoir prediction or guaranteed gain. Saving creates a proposal for separate engineer approval; no SCADA set point is changed.</p>
  </Card><Card title="Constrained injection allocation" subtitle="Engineering calculation exposed through the waterflood_optimizer tool">
    <div className="optimiser-controls"><fieldset><legend>Patterns · {D.selected.field}</legend>{patterns.map(p => <label key={p.id}><input type="checkbox" checked={selection.includes(p.id)} onChange={e => setSelection(e.target.checked ? [...selection, p.id] : selection.filter(id => id !== p.id))} />{p.id}</label>)}</fieldset>
      <label>Minimum VRR<input type="number" step=".05" min=".05" max="3" value={lower} onChange={e => setLower(Number(e.target.value))} /></label>
      <label>Maximum VRR<input type="number" step=".05" min=".05" max="3" value={upper} onChange={e => setUpper(Number(e.target.value))} /></label>
      <label>Maximum WHIP · psi<input type="number" value={whip} onChange={e => setWhip(Number(e.target.value))} /></label>
      <label>Total water · bwpd<input type="number" placeholder="Conserve current total" value={water} onChange={e => setWater(e.target.value)} /></label>
      <Action label="Run allocation" perform={async () => setResult(await api('/api/optimisation', constraints))} /></div>
    {result && result.status !== 'feasible' && <p role="alert" className="notice">{result.reason}</p>}
    {result?.status === 'feasible' && <><p className="notice">{result.basis} {result.uncertainty}</p><div className="inline-metrics"><div>Tool<strong>waterflood_optimizer</strong></div><div>Runtime<strong>{n(result.runtime_ms)} ms</strong></div><div>Day 90 incremental oil<strong>{n(result.uplift_day90_bopd)} bopd</strong></div></div>
      <table><thead><tr><th>Injector</th><th>Current · bwpd</th><th>Proposed · bwpd</th><th>Change · bwpd</th></tr></thead><tbody>{result.changes.map(c => <tr key={c.well}><td>{c.well}</td><td>{n(c.current_bwpd)}</td><td>{n(c.proposed_bwpd)}</td><td>{n(c.proposed_bwpd - c.current_bwpd)}</td></tr>)}</tbody></table>
      <Chart height={240} option={lineOption(result.forecast.days, [{ name: 'Arps base case', values: result.forecast.base_bopd, color: '#107C10' }, { name: 'Conditional P50 planning case', values: result.forecast.proposed_bopd, color: '#00A2AD' }], 'Oil (bopd)', 0, undefined, 'Forecast day')} />
      <div className="action-row"><label>Scenario name<input value={name} onChange={e => setName(e.target.value)} /></label><Action label="Save scenario for approval" perform={async () => { await api('/api/scenarios', { name, constraints }); await load(); }} /></div></>}
  </Card><Card title="Saved scenarios" subtitle="Select up to three to compare. Saving does not execute a change.">{failure && <p role="alert">{failure}</p>}
    <div className="scenario-compare">{saved.map(s => <label key={s.id}><input type="checkbox" disabled={compare.length >= 3 && !compare.includes(s.id)} checked={compare.includes(s.id)} onChange={e => setCompare(e.target.checked ? [...compare, s.id] : compare.filter(id => id !== s.id))} />{s.name} · {s.status}</label>)}</div>
    <div className="scenario-columns">{saved.filter(s => compare.includes(s.id)).map(s => <Approval key={s.id} scenario={s} changed={() => { void load(); }} />)}</div>
  </Card></div>;
}
function WorkManagement() {
  const [work, setWork] = useState<Work | null>(null), [error, setError] = useState('');
  useEffect(() => { api<Work>('/api/work').then(setWork).catch(e => setError(String(e))); }, []);
  if (!work) return <p role={error ? 'alert' : 'status'}>{error || 'Loading engineering work…'}</p>;
  return <div className="runtime-stack"><Card title="Engineering change requests" subtitle="Approved requests are recorded locally; no SCADA connection or set-point write-back">
    {work.change_requests.length ? <table><thead><tr><th>Request</th><th>Status</th><th>Approved by</th><th>Time</th></tr></thead><tbody>{work.change_requests.map(r => <tr key={r.id}><td>{r.id.slice(0, 8)}</td><td>{r.status}</td><td>{r.approved_by}</td><td>{new Date(r.approved_at).toLocaleString()}</td></tr>)}</tbody></table> : <p className="empty-state">No injection changes have been approved.</p>}
  </Card><div className="runtime-two"><Card title="Channel and work outbox" subtitle="Local recording only · no external messages sent"><table><thead><tr><th>Action</th><th>Destination</th><th>Status</th></tr></thead><tbody>{work.outbox.map(r => <tr key={r.id}><td>{r.kind}</td><td>{r.destination}</td><td>{r.status}</td></tr>)}</tbody></table></Card>
    <Card title="Active watch rules" subtitle="Evaluated against every arriving well message"><table><thead><tr><th>Well / tag</th><th>Threshold</th><th>Duration</th></tr></thead><tbody>{work.watch_rules.map(r => <tr key={r.id}><td>{r.well}<small>{r.tag}</small></td><td>{r.operator} {n(r.threshold)}</td><td>{r.duration_minutes} min</td></tr>)}</tbody></table></Card></div>
    <Card title="Engineering audit trail" subtitle="Recommendations, reviews and approved actions"><table><thead><tr><th>Time</th><th>Engineer</th><th>Action</th><th>Evidence</th></tr></thead><tbody>{work.audit.map(r => <tr key={r.id}><td>{new Date(r.ts).toLocaleString()}</td><td>{r.actor}</td><td>{r.action}</td><td><details><summary>{r.target.slice(0, 12)}</summary><pre>{JSON.stringify(JSON.parse(r.detail), null, 2)}</pre></details></td></tr>)}</tbody></table></Card></div>;
}
type AgentAnswer = { id: string; question: string; well: string; diagnosis: string; answer: string; caveat: string; sources: string[];
  tools: { name: string; duration_ms: number; status: string }[]; evidence: { hall?: { volume: number[]; pressure_integral: number[]; slope_change_pct: number };
    chan?: { day: number[]; wor: number[]; derivative: number[] }; [key: string]: unknown }; scenario?: Scenario; followups: string[] };
function Agent() {
  const D = useDashboard(), [selectedAnswer, setSelectedAnswer] = useState(
    D.selected.name === 'UG-0233' ? 'pressure' : D.selected.name === 'BG-0871' ? 'esp' : D.selected.name === 'SA-0352' ? 'drift' : 'breakthrough');
  const [answers, setAnswers] = useState<AgentAnswer[]>([]), [historyError, setHistoryError] = useState('');
  useEffect(() => { api<AgentAnswer[]>('/api/agent/examples').then(setAnswers).catch(e => setHistoryError(String(e))); }, []);
  const latest = answers.find(a => a.id === selectedAnswer) || answers.at(-1), hall = latest?.evidence.hall, chan = latest?.evidence.chan;
  const hallChart: EChartsOption = { grid: { left: 80, right: 25, top: 45, bottom: 45 }, legend: { data: ['WHIP integral'] }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', name: 'Cumulative injection (bbl)', nameLocation: 'middle', nameGap: 28, min: 0 }, yAxis: { type: 'value', name: 'WHIP integral (psi.day)', min: 0 },
    series: [{ name: 'WHIP integral', type: 'line', showSymbol: false, data: hall?.volume.map((v, i) => [v, hall.pressure_integral[i]]), itemStyle: { color: '#00A2AD' } }] };
  const chanChart: EChartsOption = { grid: { left: 70, right: 25, top: 45, bottom: 45 }, legend: { data: ['WOR', 'Positive WOR′'] }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'log', name: 'Days (log scale)', nameLocation: 'middle', nameGap: 28, min: 1, max: 100 },
    yAxis: { type: 'log', name: 'WOR / WOR′ (1/day)', min: .0001, max: 10 },
    series: [{ name: 'WOR', type: 'line', showSymbol: false, data: chan?.day.map((d, i) => [d, chan.wor[i]]), itemStyle: { color: '#0078D4' } },
      { name: 'Positive WOR′', type: 'line', showSymbol: false, data: chan?.day.map((d, i) => [d, chan.derivative[i] > 0 ? chan.derivative[i] : null]), itemStyle: { color: '#CA5010' } }] };
  return <div className="runtime-two agent-runtime"><Card title="Waterflood agent" subtitle="Four prepared engineering answers · no language-model service connected"><div className="agent-context"><Chip kind="purple">Prepared source evidence</Chip><Chip>{latest?.well || 'Four operational questions'}</Chip></div>
    {historyError && <p role="alert">{historyError}</p>}
    <div className="prepared-questions">{answers.map((a, index) => <button key={a.id} className={latest?.id === a.id ? 'active' : ''} aria-pressed={latest?.id === a.id} onClick={() => setSelectedAnswer(a.id)}><span>0{index + 1} · {a.well}</span><strong>{a.question}</strong></button>)}</div>
    {latest && <article className="agent-response" data-answer={latest.id}><h3>{latest.diagnosis}</h3><p className="answer-text">{latest.answer}</p><p className="forecast-note">{latest.caveat}</p><div className="source-chips">{latest.sources.map(s => <span key={s}>{s}</span>)}</div></article>}
    {!answers.length && !historyError && <p role="status">Loading prepared source evidence…</p>}
  </Card><div className="runtime-stack"><Card title="Hall injectivity evidence" subtitle={hall ? `Calculated slope change ${n(hall.slope_change_pct)}%` : 'Prepared breakthrough source evidence'}>{hall ? <Chart height={245} option={hallChart} /> : <p className="empty-state">Select the breakthrough question to view the calculated Hall evidence.</p>}</Card>
    <Card title="Chan water-oil diagnostic" subtitle="Log-log WOR and positive WOR′ · signed values retained in tool evidence">{chan ? <Chart height={230} option={chanChart} /> : <p className="empty-state">Select the breakthrough question to view the calculated Chan evidence.</p>}</Card>
    <Card title="Decision boundary" subtitle="No language model · no automatic actions"><p className="notice">These four answers are prepared from the stored scenarios, not newly generated reasoning or a fresh live diagnosis. Viewing them creates no proposal. Use Optimisation and the separate approval workflow for reviewed planning cases.</p></Card>
  </div></div>;
}
function QualityActions({ refresh }: { refresh: () => Promise<void> }) {
  const D = useDashboard(), [comment, setComment] = useState('');
  return <Card title="Pipeline and issue actions" subtitle="Runs and reviews are retained in the local engineering history"><div className="pipeline-actions">{D.quality.pipelines.map(p => <div key={p.name}><strong>{p.name}</strong><Action label="Run pipeline" perform={async () => { const result = await api<{ status: string; detail: string }>(`/api/pipelines/${encodeURIComponent(p.name)}/run`, {}); await refresh(); if (result.status === 'Failed') throw new Error(result.detail); }} /></div>)}</div><label>Review note<input value={comment} onChange={e => setComment(e.target.value)} /></label><div className="action-row">{D.quality.issues.map(i => <Action key={i.well} label={`Review ${i.well}`} perform={async () => { if (!comment.trim()) throw new Error('Enter an engineering review note'); await api(`/api/issues/${i.well}/review`, { comment }); await refresh(); }} />)}</div></Card>;
}
function SurveillanceActions({ refresh }: { refresh: () => Promise<void> }) {
  const [mode, setMode] = useState('threshold');
  const D = useDashboard(), [comment, setComment] = useState(''), [tag, setTag] = useState('water_cut_pct'), [limit, setLimit] = useState(55), [operator, setOperator] = useState('>'), [duration, setDuration] = useState(5);
  return <div className="runtime-two"><Card title="Alert acknowledgment" subtitle="Acknowledgment does not clear the physical condition"><label>Engineering comment<input value={comment} onChange={e => setComment(e.target.value)} /></label>
    {D.events.map(e => <div className="action-row" key={e.well + e.category}><span>{e.well} · {e.title}</span><Action label="Acknowledge" perform={async () => { if (!comment.trim()) throw new Error('Enter a comment'); await api(`/api/alerts/${encodeURIComponent(e.id || e.well)}/acknowledge`, { comment }); await refresh(); }} /></div>)}</Card>
    <Card title="Configure watch rule" subtitle={`${D.selected.name} · persistent per-tag limits`}><div className="rule-form"><label>Tag<select value={tag} onChange={e => setTag(e.target.value)}>{['water_cut_pct', 'whip_psi', 'bhp_pdg_psi', 'esp_current_a', 'inj_rate_bwpd', 'gauge_drift_psi_h'].map(t => <option key={t}>{t}</option>)}</select></label><label>Mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="threshold">Threshold</option><option value="rate_of_change">Rate of change / hour</option></select></label><label>Operator<select value={operator} onChange={e => setOperator(e.target.value)}><option>&gt;</option><option>&lt;</option></select></label><label>Threshold<input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} /></label><label>Duration · minutes<input type="number" min="1" value={duration} onChange={e => setDuration(Number(e.target.value))} /></label><Action label="Save watch rule" perform={async () => { await api('/api/watch-rules', { well: D.selected.name, tag, mode, operator, threshold: limit, duration_minutes: duration, enabled: true }); await refresh(); }} /></div></Card></div>;
}
function ServerOnly({ title, children }: { title: string; children?: React.ReactNode }) {
  return <Card title={title} subtitle="Unavailable on GitHub Pages · requires the local Python engineering service">
    {children}<p>This public browser-only edition does not execute calculations, run pipelines, save watch rules, record approvals, send work requests or retain an audit/outbox. Use the full local application for those functions. No action is silently executed or recorded here.</p>
  </Card>;
}
function App() {
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState<Filters>(defaults), [data, setData] = useState<Dashboard | null>(null), [error, setError] = useState('');
  const [connection, setConnection] = useState('Connecting'), [search, setSearch] = useState('');
  const [playback, setPlayback] = useState<Playback | null>(null), loadRevision = useRef(0);
  const catalog = useRef<Dashboard | null>(null), filtersRef = useRef(filters), refreshRef = useRef<() => Promise<void>>(async () => {});
  filtersRef.current = filters;
  useEffect(() => {
    if (['operations-overview', 'fields-and-patterns'].includes(initialPage)) {
      void import('maplibre-gl').catch(e => setError(`Geographic renderer could not load: ${e}`));
    }
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    const revision = ++loadRevision.current;
    const active = filtersRef.current, params = new URLSearchParams(active);
    if (!active.well) params.delete('well');
    const next = await api<Dashboard>(`/api/dashboard?${params}`, undefined, signal);
    if (revision !== loadRevision.current) return;
    catalog.current ||= next;
    setData(next); setError('');
  }, []);
  refreshRef.current = load;
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e)); }); return () => controller.abort(); }, [filters, load]);
  useEffect(() => {
    if (staticMode) {
      setConnection('Connected');
      return subscribePlayback(status => {
        setPlayback(status);
        void refreshRef.current().catch(e => setError(String(e)));
      });
    }
    let socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout>, stopped = false;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/stream?backfill=false`);
      socket.onopen = () => setConnection('Connected');
      socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'hello') setPlayback(message.playback);
        if (message.type === 'playback') { setPlayback(message); if (message.step === 0) void refreshRef.current().catch(e => setError(String(e))); }
        if (message.type === 'tick_complete' || message.type === 'alerts') void refreshRef.current().catch(e => setError(String(e)));
        if (message.type === 'error') { setError(message.message); socket?.close(); }
      };
      socket.onerror = () => setConnection('Reconnecting');
      socket.onclose = () => { if (!stopped) { setConnection('Reconnecting'); retry = setTimeout(connect, 1500); } };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, []);
  const update = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value };
    if (key === 'field') next.reservoir = 'all';
    if (key !== 'well' && key !== 'window_minutes' && key !== 'offset_radius_km') next.well = '';
    setFilters(next);
    const params = new URLSearchParams(next); if (!next.well) params.delete('well');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  };
  useEffect(() => {
    const change = () => {
      setPage(location.pathname.split('/').pop()?.replace('.html', '').replace('index', 'operations-overview') || 'operations-overview');
      const params = new URLSearchParams(location.search);
      setFilters({ field: params.get('field') || 'all', reservoir: params.get('reservoir') || 'all',
        well_type: params.get('well_type') || 'all', well: params.get('well') || '',
        window_minutes: params.get('window_minutes') || '4320', offset_radius_km: params.get('offset_radius_km') || '20' });
    };
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);
  const pages: Record<string, React.ReactNode> = { 'operations-overview': <Overview />, 'fields-and-patterns': <Patterns />, 'well-360': <Well />, 'well-trends': <WellTrends />, 'digital-twin': <DigitalTwin />,
    'live-surveillance': <><Surveillance />{staticMode ? <ServerOnly title="Watch rules and acknowledgments" /> : <SurveillanceActions refresh={load} />}</>,
    'data-quality-and-pipelines': <><Quality />{staticMode ? <ServerOnly title="Pipeline execution and reviews" /> : <QualityActions refresh={load} />}</>,
    agent: <Agent />, optimisation: staticMode ? <ServerOnly title="Optimisation">
      <p>The local constrained optimiser redistributes the same total injection water while checking VRR, injector rates, WHIP and bottom-hole parting limits. Conditional, uncalibrated forecasts are planning cases, not guaranteed oil gains.</p>
    </ServerOnly> : <Optimisation />, 'work-management': staticMode ? <ServerOnly title="Work management and approvals" /> : <WorkManagement /> };
  const fieldOptions = data?.available_fields || catalog.current?.fields || data?.fields || [], wells = data?.wells || [];
  return <FluentProvider theme={webLightTheme}><div className="shell functional-shell" data-stream-ts={data?.runtime.stream_timestamp}><header className="topbar"><div className="fabric-mark"><i /><i /><i /></div><strong className="fabric-word">Fabric</strong><span className="top-divider" /><span className="top-breadcrumb">Energy intelligence / <b>Waterflood Intelligence</b></span>
    <form className="global-search" onSubmit={e => { e.preventDefault(); const found = wells.find(w => w.name.toLowerCase() === search.toLowerCase()); if (found) navigate('well-360', found.name); else setError('Select an exact well name from the current asset context'); }}><SearchRegular /><input aria-label="Search wells" list="well-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a well, then Enter" /><datalist id="well-search">{wells.map(w => <option key={w.name}>{w.name}</option>)}</datalist></form>
    <div className="top-status"><span className={connection === 'Connected' ? 'live-dot' : 'amber-dot'} />{connection === 'Connected' ? playback?.running ? 'PLAYBACK' : 'SNAPSHOT' : connection}<StreamClock timestamp={data?.runtime.stream_timestamp} /></div><Avatar name="Reservoir Engineer" size={32} color="colorful" /></header>
    <aside className="rail"><div className="rail-active"><HomeRegular /><span>Home</span></div><div><DatabaseRegular /><span>OneLake</span></div><div><PulseRegular /><span>Real-Time</span></div></aside>
    <nav className="sidebar"><div className="workspace-heading"><div className="workspace-icon">WI</div><div><strong>Waterflood Intelligence</strong><span>Engineering workspace</span></div></div><span className="nav-caption">ASSET INTELLIGENCE</span>{navigation.map(([key, title, Icon]) => <a key={key} href={`${baseUrl}${key}.html?${new URLSearchParams(filters)}`} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey) return; event.preventDefault(); history.pushState(null, '', `${baseUrl}${key}.html?${new URLSearchParams(filters)}`); setPage(key); window.scrollTo(0, 0); }} className={`nav-item ${key === page ? 'active' : ''}`} aria-current={key === page ? 'page' : undefined}><Icon /><span>{title}</span></a>)}<div className="workspace-bottom"><strong>{staticMode ? 'Browser-only edition' : 'Local engineering services'}</strong><p>{staticMode ? 'Public generated source evidence' : 'ADME · Eventhouse · OneLake'}<br />{staticMode ? 'No Python service on Pages' : 'Explicit engineer approval'}</p><div><i className="green-dot" /> No field write-back</div></div></nav>
    <main><div className="page-heading"><div><div className="eyebrow">WATERFLOOD INTELLIGENCE / {filters.field === 'all' ? 'KUWAIT ASSET PORTFOLIO' : filters.field.toUpperCase()}</div><h1>{navigation.find(p => p[0] === page)?.[1] || 'Operations overview'}</h1><p>Production, pressure maintenance and evidence-led engineering decisions.</p></div><Button icon={<ArrowDownloadRegular />} onClick={() => { if (!data) return; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'engineering-snapshot.json'; a.click(); URL.revokeObjectURL(url); }}>Export</Button></div>
      <div className="filters"><span className="filter-label"><FilterRegular />Context</span>
        <label>Field<select aria-label="Field" value={filters.field} onChange={e => update('field', e.target.value)}><option value="all">All six fields</option>{fieldOptions.map(f => <option key={f.name}>{f.name}</option>)}</select></label>
        <label>Reservoir<select aria-label="Reservoir" value={filters.reservoir} onChange={e => update('reservoir', e.target.value)}><option value="all">All reservoirs</option>{[...new Set(fieldOptions.filter(f => filters.field === 'all' || f.name === filters.field).map(f => f.reservoir))].map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Well type<select aria-label="Well type" value={filters.well_type} onChange={e => update('well_type', e.target.value)}><option value="all">Producers + injectors</option><option value="producer">Producers</option><option value="injector">Injectors</option></select></label>
        <label>Well<select aria-label="Well" value={filters.well || data?.selected.name || ''} onChange={e => update('well', e.target.value)}>{wells.map(w => <option key={w.name}>{w.name}</option>)}</select></label>
        <label>Time window<select aria-label="Time window" value={filters.window_minutes} onChange={e => update('window_minutes', e.target.value)}><option value="4320">Last 72 hours</option><option value="1440">Last 24 hours</option><option value="360">Last 6 hours</option><option value="60">Last hour</option></select></label>
        </div>
      <PlaybackControls status={playback} changed={setPlayback} refresh={load} />
      {staticMode && <p className="notice">GitHub Pages · browser-only · generated illustrative operating profiles, not measured telemetry. Playback runs in this tab while open; background tabs may throttle timers. No server, language model or field connection.</p>}
      {error && <div className="error-banner" role="alert">{error}<Button onClick={() => { setFilters({ ...defaults, field: 'all', reservoir: 'all', well_type: 'all', well: '' }); }}>Reset context</Button></div>}
      {data ? <DashboardContext.Provider value={data}><div className={`page-content ${page}`} key={`${filters.field}:${filters.reservoir}:${filters.well_type}:${page === 'well-360' ? 'all-wells' : data.selected.name}`}>{pages[page] || <Overview />}</div></DashboardContext.Provider> : <div className="loading-state" role="status">Connecting to the engineering data foundation…</div>}
      <footer className="page-footer"><span>Source allocation {data?.as_of || '—'} · minute CSV / accelerated playback</span><span>{staticMode ? 'Server actions unavailable on Pages · no SCADA writes' : 'Local channel/work outbox · no SCADA writes'}</span><span>Oilfield units · WGS 84</span></footer></main></div></FluentProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
