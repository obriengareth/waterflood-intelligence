import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme, Button, Avatar, Tooltip } from '@fluentui/react-components';
import { GridRegular, HomeRegular, MapRegular, CubeRegular, PulseRegular, DatabaseRegular, SparkleRegular, ArrowTrendingRegular, SettingsRegular, SearchRegular, AlertRegular, ChevronDownRegular, ArrowRightRegular, CheckmarkCircleRegular, ShieldCheckmarkRegular, ClockRegular, ArrowDownloadRegular, FilterRegular, MoreHorizontalRegular, LayerRegular, DismissRegular, DocumentRegular, SendRegular, LockClosedRegular } from '@fluentui/react-icons';
import type * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, Geometry } from 'geojson';
import { useDashboard, navigate } from './context';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const C = { oil: '#107C10', water: '#0078D4', injection: '#00A2AD', red: '#D13438', amber: '#CA5010', purple: '#7B4FD1', blue: '#0F6CBD' };
const GeologicalView = lazy(() => import('./geology'));
export const n = (v: number | null | undefined, digits = 0) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pageList = [
  ['operations-overview', 'Operations overview', HomeRegular],
  ['fields-and-patterns', 'Fields and patterns', MapRegular],
  ['well-360', 'Well 360', CubeRegular],
  ['live-surveillance', 'Live surveillance', PulseRegular],
  ['data-quality-and-pipelines', 'Data quality and pipelines', DatabaseRegular],
  ['agent', 'Agent', SparkleRegular]
] as const;
const current = location.pathname.split('/').pop()?.replace('.html', '') || 'operations-overview';
const page = pageList.find(p => p[0] === current) || pageList[0];
const focused = ['fields-and-patterns', 'well-360', 'live-surveillance', 'agent'].includes(current);

export function Chip({ children, kind = 'neutral' }: { children: React.ReactNode; kind?: string }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}
function Vrr({ value }: { value: number | null }) {
  if (value == null) return <Chip>Not applicable</Chip>;
  const kind = value < .85 ? 'red' : value < .95 ? 'amber' : value <= 1.05 ? 'green' : 'blue';
  return <Chip kind={kind}>{n(value, 2)}</Chip>;
}
export function Card({ title, subtitle, extra, children, className = '' }: { title: string; subtitle?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}><header className="card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{extra || <MoreHorizontalRegular className="more" />}</header>{children}</section>;
}
function Kpi({ label, value, unit, detail, color = C.blue, trend, icon }: { label: string; value: string; unit?: string; detail: string; color?: string; trend?: number[]; icon?: React.ReactNode }) {
  return <div className="kpi" style={{ '--accent': color } as React.CSSProperties}><div className="kpi-label">{label}{icon || <ArrowTrendingRegular />}</div><div className="kpi-value">{value}<span>{unit}</span></div><div className="kpi-detail">{detail}</div>{trend && <Spark values={trend} color={color} />}</div>;
}
function Spark({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v, i) => `${i / (values.length - 1) * 110},${26 - (v - min) / (max - min || 1) * 22}`).join(' ');
  return <svg className="spark" viewBox="0 0 110 30" aria-hidden="true"><polyline points={points} stroke={color} fill="none" strokeWidth="2" /></svg>;
}
export function Chart({ option, height = 230 }: { option: EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: ReturnType<typeof import('./charts')['init']> | undefined;
    let resize: ResizeObserver | undefined;
    void import('./charts').then(module => {
      if (disposed) return;
      const instance = module.init(ref.current!, undefined, { renderer: 'svg' });
      chart = instance;
      instance.setOption({ animation: false, textStyle: { fontFamily: 'Segoe UI', fontSize: 12, color: '#596579' }, ...option });
      resize = new ResizeObserver(() => chart?.resize());
      resize.observe(ref.current!);
    });
    return () => { disposed = true; resize?.disconnect(); chart?.dispose(); };
  }, [option]);
  return <div ref={ref} className="chart" style={{ height }} />;
}
const baseGrid = { left: 65, right: 26, top: 55, bottom: 44 };
function operatingRange(values: number[], minimumSpan: number): [number, number] {
  const finite = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return [0, minimumSpan];
  const low = Math.min(...finite), high = Math.max(...finite), span = Math.max(high - low, minimumSpan);
  const center = (low + high) / 2;
  return [Math.max(0, center - span * .65), center + span * .65];
}
export function lineOption(x: (string | number)[], series: { name: string; values: number[]; color: string }[], unit: string, min: number = 0, max?: number, xUnit?: string): EChartsOption {
  return {
    grid: baseGrid, legend: { top: 4, left: 24, icon: 'roundRect', itemWidth: 14, itemHeight: 3, textStyle: { color: '#536073' } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: x, boundaryGap: false, name: xUnit || (typeof x[0] === 'number' ? 'Elapsed hour' : 'Month'), nameLocation: 'middle', nameGap: 29, axisLine: { lineStyle: { color: '#D9DFE7' } }, axisTick: { show: false }, axisLabel: { interval: 'auto', color: '#68758A', fontSize: 11 } },
    yAxis: { type: 'value', name: unit, nameLocation: 'end', min, max, axisLabel: { formatter: (v: number) => Math.abs(v) >= 10000 ? `${n(v / 1000)}k` : n(v, unit.includes('%') ? 1 : 0) }, splitLine: { lineStyle: { color: '#EDF0F4', type: 'dashed' } } },
    series: series.map(s => ({ name: s.name, type: 'line', data: s.values, smooth: .2, showSymbol: false, lineStyle: { width: 2.4, color: s.color }, itemStyle: { color: s.color } }))
  };
}
function Attribution() {
  return <div className="attribution"><a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX IT Services GmbH</a> · Contains modified Copernicus Sentinel data 2016 &amp; 2017 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></div>;
}
function AssetMap({ pattern = false }: { pattern?: boolean }) {
  const D = useDashboard();
  const selectedField = D.selected.field;
  const p03 = D.patterns.find(p => p.id === D.selected.pattern) || D.patterns[0];
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [layers, setLayers] = useState({ satellite: true, fields: true, wells: true, patterns: true, trunks: true });
  const [attribute, setAttribute] = useState('water_cut_pct');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    setReady(false);
    setFailure('');
    let disposed = false;
    let cleanup = () => {};
    async function initialize() {
    const { default: maplibregl } = await import('maplibre-gl');
    if (disposed) return;
    const localSatellite = pattern && selectedField === 'Raudhatain';
    const bounds: [number, number, number, number] = localSatellite ? [47.38, 29.74, 47.97, 29.94] : [45.6, 28.5, 49.8, 30.25];
    const [west, south, east, north] = bounds;
    const map = new maplibregl.Map({ container: ref.current!, style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#E9EBE4' } }] },
      center: pattern ? [47.68, 29.84] : [47.82, 29.33], zoom: pattern ? 11.5 : 8.0, attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true } });
    const markers: maplibregl.Marker[] = [];
    mapRef.current = map;
    map.on('error', e => setFailure(e.error.message));
    map.on('load', () => {
    map.addSource('regional', { type: 'image', url: './assets/regional-satellite.webp', coordinates: [[43.5, 33.5], [52.5, 33.5], [52.5, 25.5], [43.5, 25.5]] });
    map.addLayer({ id: 'regional-satellite', type: 'raster', source: 'regional', paint: { 'raster-fade-duration': 0 } });
      map.addSource('satellite', { type: 'image', url: `./assets/${localSatellite ? 'raudhatain' : 'kuwait'}-satellite.jpg`, coordinates: [[west, north], [east, north], [east, south], [west, south]] });
      map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 0 } });
      const fieldFeatures = D.gis.filter(f => f.properties.layer === 'field' && (!pattern || f.properties.name === selectedField));
      map.addSource('fields', { type: 'geojson', data: { type: 'FeatureCollection', features: fieldFeatures } as FeatureCollection<Geometry> });
      map.addLayer({ id: 'field-fill', type: 'fill', source: 'fields', paint: { 'fill-color': C.blue, 'fill-opacity': .06 } });
      map.addLayer({ id: 'field-line', type: 'line', source: 'fields', paint: { 'line-color': '#497772', 'line-width': 1.6, 'line-dasharray': [4, 2] } });
      if (!pattern) {
        map.addSource('country', { type: 'geojson', data: './assets/country.geojson' });
        map.addLayer({ id: 'country-line', type: 'line', source: 'country', paint: { 'line-color': '#FFF', 'line-width': 1.3, 'line-opacity': .8 } });
        map.addSource('pipelines', { type: 'geojson', data: { type: 'FeatureCollection', features: D.gis.filter(f => f.properties.layer === 'pipeline') } as FeatureCollection<Geometry> });
        map.addLayer({ id: 'trunks', type: 'line', source: 'pipelines', paint: { 'line-color': '#FEFCED', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
      } else {
        const patternFeatures = D.patterns.filter(p => p.field === selectedField).map(p => ({
          type: 'Feature' as const, properties: { vrr: p.vrr },
          geometry: { type: 'Polygon' as const, coordinates: [[[p.lon - .018, p.lat], [p.lon, p.lat + .014], [p.lon + .018, p.lat], [p.lon, p.lat - .014], [p.lon - .018, p.lat]]] }
        }));
        map.addSource('patterns', { type: 'geojson', data: { type: 'FeatureCollection', features: patternFeatures } });
        map.addLayer({ id: 'pattern-fill', type: 'fill', source: 'patterns', paint: { 'fill-color': ['case', ['<', ['get', 'vrr'], .85], C.red, ['<', ['get', 'vrr'], .95], C.amber, ['<=', ['get', 'vrr'], 1.05], C.oil, C.blue], 'fill-opacity': .20 } });
        map.addLayer({ id: 'pattern-line', type: 'line', source: 'patterns', paint: { 'line-color': '#fff', 'line-width': 1.4 } });
        D.patterns.filter(p => p.field === selectedField).forEach(p => {
          const el = document.createElement('div');
          el.className = `pattern-label ${p.id === 'RA-P03' ? 'selected-pattern' : ''}`;
          el.dataset.pattern = p.id;
          el.textContent = `${p.id}  ·  ${n(p.vrr, 2)}`;
          markers.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat - .007]).addTo(map));
        });
      }
      const displayed = D.wells.filter(w => !pattern || w.field === selectedField);
      ref.current!.dataset.wellCount = String(displayed.length);
      map.addSource('wells', { type: 'geojson', data: { type: 'FeatureCollection', features: displayed.map(w => ({ type: 'Feature', properties: w, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } })) } });
      map.addLayer({ id: 'producers', type: 'circle', source: 'wells', filter: ['==', ['get', 'type'], 'producer'], paint: { 'circle-color': C.oil, 'circle-radius': pattern ? ['interpolate', ['linear'], ['get', 'water_cut_pct'], 15, 4, 65, 11] : 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'injectors', type: 'circle', source: 'wells', filter: ['==', ['get', 'type'], 'injector'], paint: { 'circle-color': C.injection, 'circle-radius': pattern ? 6 : 4.6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      for (const layer of ['producers', 'injectors']) {
        map.on('click', layer, event => {
          const name = event.features?.[0]?.properties?.name;
          if (typeof name === 'string') setPicked(name);
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      if (pattern) {
        displayed.slice(0, 3).forEach(w => {
          const name = w.name;
          const el = document.createElement('div'); el.className = 'well-label'; el.textContent = name;
          markers.push(new maplibregl.Marker({ element: el, offset: [0, -20] }).setLngLat([w.lon, w.lat]).addTo(map));
        });
      } else {
        D.fields.forEach(f => {
          const el = document.createElement('div'); el.className = 'field-label';
          el.dataset.field = f.name;
          const strong = document.createElement('strong'); strong.textContent = f.name;
          const span = document.createElement('span'); span.textContent = `${f.producers + f.injectors} wells · ${n(f.oil_bopd)} bopd`;
          el.append(strong, span);
          const left = f.prefix === 'MN' || f.prefix === 'UG';
          const dy = f.prefix === 'RA' ? .085 : f.prefix === 'SA' ? -.055 : f.prefix === 'BH' ? -.035 : .02;
          markers.push(new maplibregl.Marker({ element: el }).setLngLat([f.lon + (left ? -.27 : .27), f.lat + dy]).addTo(map));
        });
        D.gis.filter(f => f.properties.layer === 'facility').forEach(f => {
          if (f.geometry.type !== 'Point') return;
          const coords = f.geometry.coordinates as number[];
          const el = document.createElement('div'); el.className = 'gc-marker'; el.textContent = f.properties.name;
          markers.push(new maplibregl.Marker({ element: el }).setLngLat([coords[0], coords[1]]).addTo(map));
        });
      }
      const extent = new maplibregl.LngLatBounds();
      displayed.forEach(w => extent.extend([w.lon, w.lat]));
      map.fitBounds(pattern ? extent : [[47.1, 28.45], [48.5, 30.2]], { padding: pattern ? 70 : { top: 55, bottom: 45, left: 65, right: 75 }, maxZoom: 12, duration: 0 });
      map.once('idle', () => {
        const size = ref.current!.getBoundingClientRect();
        const visible = displayed.filter(w => {
          const p = map.project([w.lon, w.lat]);
          return p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height;
        });
        ref.current!.dataset.visibleWellCount = String(visible.length);
        setReady(true); ref.current!.dataset.ready = 'true';
      });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    cleanup = () => { mapRef.current = null; markers.forEach(m => m.remove()); map.remove(); };
    }
    void initialize().catch(error => setFailure(String(error)));
    return () => { disposed = true; cleanup(); };
  }, [pattern, selectedField, D.wells.map(w => w.name).join(',')]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('wells')) return;
    (map.getSource('wells') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: D.wells.filter(w => !pattern || w.field === selectedField).map(w => ({
      type: 'Feature', properties: w, geometry: { type: 'Point', coordinates: [w.lon, w.lat] }
    })) });
    ref.current?.querySelectorAll<HTMLDivElement>('.field-label').forEach(element => {
      const field = D.fields.find(f => f.name === element.dataset.field);
      const span = element.querySelector('span');
      if (field && span) span.textContent = `${field.producers + field.injectors} wells · ${n(field.oil_bopd)} bopd`;
    });
    ref.current?.querySelectorAll<HTMLDivElement>('.pattern-label').forEach(element => {
      const item = D.patterns.find(p => p.id === element.dataset.pattern);
      if (item) element.textContent = `${item.id} · ${n(item.vrr, 2)}`;
    });
    const patterns = map.getSource('patterns') as maplibregl.GeoJSONSource | undefined;
    if (patterns) patterns.setData({ type: 'FeatureCollection', features: D.patterns.filter(p => p.field === selectedField).map(p => ({
      type: 'Feature', properties: { vrr: p.vrr }, geometry: { type: 'Polygon', coordinates: [[[p.lon - .018, p.lat], [p.lon, p.lat + .014], [p.lon + .018, p.lat], [p.lon, p.lat - .014], [p.lon - .018, p.lat]]] }
    })) });
  }, [D, ready, pattern, selectedField]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [key, ids] of Object.entries({ satellite: ['regional-satellite', 'satellite'], fields: ['field-fill', 'field-line'], wells: ['producers', 'injectors'], patterns: ['pattern-fill', 'pattern-line'], trunks: ['trunks'] })) {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key as keyof typeof layers] ? 'visible' : 'none');
    }
    if (map.getLayer('producers')) map.setPaintProperty('producers', 'circle-radius', ['interpolate', ['linear'], ['coalesce', ['get', attribute], 0], 0, 4, attribute === 'water_cut_pct' ? 65 : 6000, 12]);
  }, [layers, attribute, ready]);
  const pickedWell = D.wells.find(w => w.name === picked);
  return <div className={`map-wrap ${pattern ? 'pattern-map' : ''}`}><div ref={ref} className="asset-map" data-map="true" />
    <details className="layer-controls"><summary>Map layers</summary>{(Object.keys(layers) as (keyof typeof layers)[]).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers({ ...layers, [key]: e.target.checked })} />{key === 'satellite' ? 'Satellite / light' : key}</label>)}<label>Size by<select value={attribute} onChange={e => setAttribute(e.target.value)}><option value="water_cut_pct">Water cut (%)</option><option value="oil_bopd">Oil (bopd)</option><option value="whip_psi">WHIP (psi)</option></select></label><button onClick={() => mapRef.current?.fitBounds([[43.5, 25.5], [52.5, 33.5]], { padding: 30, duration: 600 })}>Regional extent</button><button onClick={() => ref.current?.parentElement?.requestFullscreen()}>Full screen</button></details>
    {pickedWell && <div className="well-map-panel"><button aria-label="Close well panel" onClick={() => setPicked(null)}>×</button><h3>{pickedWell.name}</h3><p>{pickedWell.field} · {pickedWell.type} · {pickedWell.status}</p><p>{n(pickedWell.oil_bopd)} bopd · {n(pickedWell.inj_bwpd)} bwpd · {n(pickedWell.water_cut_pct)}% WCT</p><p>WGS 84 {n(pickedWell.lat, 5)}, {n(pickedWell.lon, 5)}</p><p>KTM {n(pickedWell.ktm_easting_m)} E / {n(pickedWell.ktm_northing_m)} N m</p><Button onClick={() => navigate('well-360', pickedWell.name)}>Open Well 360</Button></div>}
    <div className="map-tags"><Chip kind="white"><LayerRegular /> Satellite · historical 2016/17</Chip><Chip kind="white">{pattern ? `${D.selected.reservoir} · VRR overlay` : `${D.wells.length} assets · WGS 84`}</Chip></div>
    {pattern && <div className="map-selection"><span className="eyebrow">SELECTED PATTERN</span><h3>{p03.id} <Vrr value={p03.vrr} /></h3><p>{p03.injector} → {p03.producers.join(' / ')}</p><div><span>Water cut<strong>{n(p03.water_cut_pct, 1)}%</strong></span><span>Injection<strong>{n(p03.inj_bwpd)} bwpd</strong></span></div></div>}
    <div className="map-legend"><span><i style={{ background: C.oil }} />Producer{pattern && ' · size = water cut'}</span><span><i style={{ background: C.injection }} />Injector</span>{!pattern && <span>▣ Gathering centre</span>}<span>Indicative asset geometry</span></div>
    <Attribution />{failure && <div className="map-error">Map unavailable: {failure}</div>}{!ready && !failure && <div className="loading">Loading geographic imagery…</div>}
  </div>;
}
export function Overview() {
  const D = useDashboard();
  const p03 = D.patterns.find(p => p.id === D.selected.pattern) || D.patterns[0];
  const m = D.metrics;
  return <>
    <div className="kpi-grid six">
      <Kpi label="Net oil rate" value={n(m.oil_bopd)} unit="bopd" detail={`${n((m.oil_bopd / m.prior_oil_bopd - 1) * 100, 2)}% vs prior day`} color={C.oil} trend={D.trend.oil} />
      <Kpi label="Water injection" value={n(m.inj_bwpd)} unit="bwpd" detail={`${n((m.inj_bwpd / m.prior_inj_bwpd - 1) * 100, 2)}% vs prior day`} color={C.injection} trend={D.trend.injection} />
      <Kpi label="Field water cut" value={n(m.water_cut_pct, 1)} unit="%" detail={`${n(m.water_cut_pct - m.prior_water_cut_pct, 2)} pp vs prior day`} color={C.water} trend={D.trend.water} />
      <Kpi label="Instantaneous VRR" value={n(m.vrr, 2)} detail={`${n(m.vrr - m.prior_vrr, 3)} vs prior day · reservoir volumes`} color={C.blue} />
      <Kpi label="Wells online" value={`${m.online}/${D.wells.length}`} detail={`${m.online - m.prior_online} vs prior day · ${D.wells.filter(w => w.type === 'producer').length} producers / ${D.wells.filter(w => w.type === 'injector').length} injectors`} color={C.oil} icon={<CheckmarkCircleRegular />} />
      <Kpi label="Open alerts" value={n(m.open_alerts)} detail={`+${m.open_alerts - m.prior_open_alerts} vs prior day · ${D.events.filter(e => e.severity === 'Critical').length} critical`} color={C.red} icon={<AlertRegular />} />
    </div>
    <div className="overview-grid">
      <Card title="Kuwait asset intelligence" subtitle="Six fields. One operational picture." extra={<Chip kind="green">● All assets located</Chip>} className="map-card">
        <AssetMap />
        <div className="map-insight"><SparkleRegular /><div><strong>{D.selected.field} engineering context</strong><p>{p03.id} VRR {n(p03.vrr, 2)} · {D.selected.name} water cut {n(D.selected.water_cut_pct)}% · injection connectivity review</p></div><a href={`./agent.html${location.search}`}>Open evidence <ArrowRightRegular /></a></div>
      </Card>
      <div className="right-stack">
        <Card title="Field performance" subtitle="Ranked by instantaneous voidage replacement" extra={<Chip>All fields</Chip>}>
          <table className="field-table"><thead><tr><th>Field / reservoir</th><th>Oil<br />bopd</th><th>Injection<br />bwpd</th><th>WCT<br />%</th><th>VRR</th></tr></thead><tbody>{[...D.fields].sort((a, b) => a.vrr - b.vrr).map(f => <tr key={f.name}><td><strong>{f.name}</strong><small>{f.reservoir}</small></td><td className="oil-text">{n(f.oil_bopd)}</td><td>{n(f.inj_bwpd)}</td><td>{n(f.water_cut_pct, 1)}</td><td><Vrr value={f.vrr} /></td></tr>)}</tbody><tfoot><tr><td>All fields</td><td>{n(m.oil_bopd)}</td><td>{n(m.inj_bwpd)}</td><td>{n(m.water_cut_pct, 1)}</td><td>{n(m.vrr, 2)}</td></tr></tfoot></table>
          <div className="vrr-key"><i className="red-dot" />&lt;0.85 <i className="amber-dot" />0.85–0.95 <i className="green-dot" />0.95–1.05 <i className="blue-dot" />&gt;1.05</div>
        </Card>
        <Card title="Active alerts" subtitle="Exceptions that need an engineer" extra={<a className="text-link" href="./live-surveillance.html">View all {m.open_alerts} <ArrowRightRegular /></a>}>
          <div className="alerts">{D.events.slice(0, 3).map(e => <a href={`./live-surveillance.html?well=${e.well}`} className="alert-row" key={e.id}><span className={`alert-icon ${e.severity === 'Critical' ? 'red' : 'amber'}`}><AlertRegular /></span><div><strong>{e.well} <span>{e.title}</span></strong><p>{e.detail}</p></div><Chip kind={e.severity === 'Critical' ? 'red' : 'amber'}>{e.severity}</Chip></a>)}</div>
        </Card>
      </div>
    </div>
  </>;
}
export function Patterns() {
  const D = useDashboard();
  const ra = D.fields.find(f => f.name === D.selected.field)!;
  const patterns = D.patterns.filter(p => p.field === D.selected.field);
  const p03 = patterns.find(p => p.id === D.selected.pattern) || patterns[0];
  const option = lineOption(D.trend.months, [{ name: 'Oil', values: D.trend.oil, color: C.oil }, { name: 'Produced water', values: D.trend.water, color: C.water }, { name: 'Injection', values: D.trend.injection, color: C.injection }], 'Rate (bpd)');
  return <>
    <div className="context-banner"><span><MapRegular /> <strong>{ra.name}</strong> / {ra.reservoir}</span><span>{ra.producers + ra.injectors} wells · {patterns.length} allocation patterns</span><Chip kind="blue">{p03.id} · VRR {n(p03.vrr, 2)}</Chip></div>
    <div className="patterns-grid">
      <div className="left-stack"><Card title="Pattern surveillance" subtitle="Satellite surface context with engineering allocation overlays" className="map-card"><AssetMap pattern /></Card>
        <Card title="Pattern balance" subtitle="Stock-tank rates · pressure at reservoir conditions">
          <table><thead><tr><th>Pattern</th><th>Injection · bwpd</th><th>VRR</th><th>WCT · %</th><th>Pressure · psia</th><th>Condition</th></tr></thead><tbody>{patterns.map(p => <tr className={p.id === 'RA-P03' ? 'selected-row' : ''} key={p.id}><td><strong>{p.id}</strong></td><td>{n(p.inj_bwpd)}</td><td><Vrr value={p.vrr} /></td><td>{n(p.water_cut_pct, 1)}</td><td>{n(p.pressure_psia)}</td><td><Chip kind={p.vrr < .85 ? 'red' : p.vrr > 1.05 ? 'blue' : p.vrr < .95 ? 'amber' : 'green'}>{p.vrr < .85 ? 'Under-replaced' : p.vrr > 1.05 ? 'Over-replaced' : p.vrr < .95 ? 'Watch' : 'Balanced'}</Chip></td></tr>)}</tbody></table>
        </Card></div>
      <div className="right-stack"><Card title="24-month field performance" subtitle="Monthly field totals · pressure maintenance vs bubble point" extra={<Chip>24 months</Chip>}><Chart option={option} height={165} /><div className="inline-metrics"><div>Field oil<strong className="oil-text">{n(ra.oil_bopd)} <small>bopd</small></strong></div><div>Field injection<strong className="teal-text">{n(ra.inj_bwpd)} <small>bwpd</small></strong></div><div>Cumulative VRR<strong>{n(D.trend.cumulative_vrr.at(-1)!, 2)}</strong></div></div>
          <Chart height={150} option={lineOption(D.trend.months, [{ name: 'Reservoir pressure assumption', values: D.trend.pressure_psia, color: C.blue }, { name: 'Bubble point', values: D.trend.months.map(() => D.trend.bubble_point_psia), color: C.amber }], 'Pressure (psia)', 0)} />
        </Card>
        <Card title="Injector → producer connectivity" subtitle="180-day reference parameters · not a fitted CRMP" extra={<Chip kind="purple">CRM</Chip>}>
          <table className="crm-table"><thead><tr><th>Connection</th><th>Gain fᵢⱼ</th><th>τ · days</th><th>R²</th></tr></thead><tbody>{D.crm.filter(c => c.pattern === p03.id).sort((a, b) => b.gain - a.gain).slice(0, 3).map(c => <tr key={c.injector + c.producer}><td><strong>{c.injector}</strong><span className="pair-arrow"> → </span>{c.producer}</td><td><div className="gain-bar"><i style={{ width: `${c.gain * 100}%` }} /><span>{n(c.gain, 2)}</span></div></td><td>{n(c.time_constant_days, 1)}</td><td>{n(c.fit_r2, 2)}</td></tr>)}</tbody></table>
          <div className="notice purple"><SparkleRegular /><span>{p03.id === 'RA-P03' ? `${n(D.agent.crm_gain, 2)} reference gain to RA-0417 vs ${n(D.agent.pattern_mean_gain, 2)} mean.` : 'Reference parameters where available; fit diagnostics are available through the engineering tool.'} Parameters require calibration before allocation decisions.</span></div>
        </Card>
      </div>
    </div>
  </>;
}
function GeologicalScene() {
  return <Suspense fallback={<div className="scene loading-state">Loading wellbore geometry…</div>}><GeologicalView /></Suspense>;
}
const TwinView = lazy(() => import('./twin'));
export function DigitalTwin() {
  return <Card title="Digital twin · terrain and wellsite" subtitle="Real cached elevation and satellite texture · photo-informed illustrative surface equipment">
    <Suspense fallback={<div className="loading-state">Loading the surface digital twin…</div>}><TwinView /></Suspense>
  </Card>;
}
export function Well() {
  return <Card title="Regional wellbore & geological workspace" subtitle="All filtered wells and all available formation surfaces · field and reservoir filters apply across the workspace">
    <GeologicalScene />
  </Card>;
}
export function WellTrends() {
  const D = useDashboard();
  const [recent, setRecent] = useState(true);
  const w = D.selected, rt = recent ? D.recent_realtime : D.realtime, hours = rt.minute.map(m => Number((m / 60).toFixed(2)));
  const windowHours = (recent ? Math.min(D.runtime.minutes, 120) : D.runtime.minutes) / 60;
  const ranges = [operatingRange(rt.wct, 1), operatingRange(rt.oil, 50), operatingRange(rt.liquid, 100), operatingRange(rt.bhp, 20)];
  const [detailTag, setDetailTag] = useState('gor');
  const extendedTags: { key: 'gor' | 'whp' | 'esp_frequency' | 'esp_current' | 'esp_pip' | 'bhp' | 'injection' | 'whip'; label: string; unit: string }[] = w.type === 'injector'
    ? [{ key: 'injection', label: 'Injection', unit: 'bwpd' }, { key: 'whip', label: 'WHIP', unit: 'psi' }, { key: 'bhp', label: 'BHIP', unit: 'psi' }]
    : [{ key: 'gor', label: 'GOR', unit: 'scf/stb' }, { key: 'whp', label: 'WHP', unit: 'psi' }, { key: 'esp_frequency', label: 'ESP frequency', unit: 'Hz' },
      { key: 'esp_current', label: 'ESP current', unit: 'A' }, { key: 'esp_pip', label: 'ESP intake pressure', unit: 'psi' }, { key: 'bhp', label: 'BHP (PDG)', unit: 'psi' }];
  const detail = extendedTags.find(tag => tag.key === detailTag) || extendedTags[0];
  const operating: EChartsOption = {
    legend: { top: 3, left: 180, itemWidth: 14, itemHeight: 3, data: ['Water cut', 'Liquid rate', 'Oil rate', 'BHP (PDG)'] },
    tooltip: { trigger: 'axis' },
    grid: [42, 130, 218, 306].map(top => ({ left: 85, right: 28, top, height: 55 })),
    xAxis: [0, 1, 2, 3].map(index => ({ type: 'category' as const, gridIndex: index, data: hours, boundaryGap: false,
      axisLabel: { show: index === 3, interval: 19, fontSize: 11 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#DDE4ED' } },
      name: index === 3 ? 'Elapsed hour' : '', nameLocation: 'middle' as const, nameGap: 27 })),
    yAxis: ['Water cut (%)', 'Oil (bopd)', 'Liquid (bpd)', 'BHP (psi)']
      .map((name, index) => ({ name, min: ranges[index][0], max: ranges[index][1], type: 'value' as const, gridIndex: index, splitNumber: 2,
        axisLabel: { fontSize: 11, formatter: (v: number) => n(v, index === 0 ? 1 : 0) }, splitLine: { lineStyle: { color: '#EDF0F5', type: 'dashed' as const } } })),
    series: [{ name: 'Water cut', values: rt.wct, index: 0, color: C.water }, { name: 'Liquid rate', values: rt.liquid, index: 2, color: C.injection },
      { name: 'Oil rate', values: rt.oil, index: 1, color: C.oil }, { name: 'BHP (PDG)', values: rt.bhp, index: 3, color: C.blue }]
      .map(s => ({ name: s.name, type: 'line' as const, xAxisIndex: s.index, yAxisIndex: s.index, data: s.values, showSymbol: false,
        lineStyle: { color: s.color, width: 2.3 }, itemStyle: { color: s.color } }))
  };
  return <>
    <div className="well-banner"><div className="well-avatar"><CubeRegular /></div><div><h2>{w.name} <Chip kind="green">{w.status}</Chip></h2><p>{w.uwi} · {w.field} / {w.reservoir} · {w.lift} / {w.completion_type}</p></div><div className="well-header-metric"><span>Oil rate</span><strong className="oil-text">{n(w.oil_bopd)} <small>bopd</small></strong></div><div className="well-header-metric"><span>Water cut</span><strong className="water-text">{n(w.water_cut_pct!, 1)}<small>%</small></strong></div><div className="well-header-metric"><span>BHP (PDG)</span><strong>{n(w.bhp_psi)} <small>psi</small></strong></div><a href={`./agent.html?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), well: w.name })}`} className="agent-link"><SparkleRegular /> Investigate with agent</a></div>
    <div className="well-grid">
      <div className="left-stack"><Card title="Completion and survey dimensions" subtitle="Selected well · source interval and minimum-curvature records"><div className="inline-metrics"><div>Total MD<strong>{n(w.md_ft)} <small>ft</small></strong></div><div>TVDSS<strong>{n(w.depth_tvdss_ft)} <small>ft</small></strong></div><div>Max inclination<strong>{n(w.max_inclination_deg, 1)}°</strong></div><div>Kick-off point<strong>{n(w.kickoff_md_ft)} <small>ft MD</small></strong></div></div>
        <table><thead><tr><th>Interval</th><th>MD · ft</th><th>TVDSS · ft</th></tr></thead><tbody>{D.completion.intervals.map((interval, i) => <tr key={i}><td>{interval.type}</td><td>{n(interval.md_top_ft)}–{n(interval.md_base_ft)}</td><td>{n(interval.tvdss_top_ft)}–{n(interval.tvdss_base_ft)}</td></tr>)}</tbody></table>
      </Card>
      <Card title="Well header" subtitle="Subsurface records · OSDU-shaped master data"><dl className="header-grid">
        {[['UWI', w.uwi], ['Spud / completion', `${w.spud_date} / ${w.completion_date}`], ['Surface · WGS 84', `${n(w.lat, 5)}° N, ${n(w.lon, 5)}° E`], ['KTM · easting / northing', `${n(w.ktm_easting_m)} / ${n(w.ktm_northing_m)} m`], ['PVT region / bubble point', `${w.pvt_region} / ${n(w.bubble_point_psia)} psia`], ['Last well test', w.last_test_date], ['Completion', `${D.completion.casing_od_in} in casing · ${D.completion.tubing_od_in} in tubing · ${D.completion.intervals.map(i => i.type).join(', ')}`], ['Reservoir temperature', `${n(D.pvt.temperature_degf)} °F`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></Card></div>
      <div className="right-stack">
        <Card title={`${n(windowHours)}-hour operating detail`} subtitle={`${w.name} · labelled local axes · stored minute records`} extra={<select aria-label="Operating chart window" value={recent ? 'recent' : 'history'} onChange={e => setRecent(e.target.value === 'recent')}><option value="recent">Recent {n(Math.min(D.runtime.minutes, 120) / 60)}-hour detail</option><option value="history">Selected history</option></select>}>
          {w.type === 'injector' ? <><Chart height={170} option={lineOption(hours, [{ name: `${w.name} injection`, values: rt.injection, color: C.injection }], 'Injection (bwpd)', ...operatingRange(rt.injection, 200))} /><Chart height={170} option={lineOption(hours, [{ name: `${w.name} WHIP`, values: rt.whip, color: C.blue }], 'WHIP (psi)', ...operatingRange(rt.whip, 20))} /></> : <Chart height={410} option={operating} />}
          <div className="tag-strip">{[['GOR', `${n(rt.gor.at(-1)!)} scf/stb`], ['WHP', `${n(rt.whp.at(-1)!)} psi`], ['ESP', `${n(rt.esp_frequency.at(-1)!, 1)} Hz / ${n(rt.esp_current.at(-1)!, 1)} A`], ['Intake', `${n(rt.esp_pip.at(-1)!)} psi`]].map(([tag, value]) => <span key={tag}>{tag}<strong>{value}</strong></span>)}</div>
        </Card>
        <Card title="Well tests & production history" subtitle="Last three separator tests · 24-month allocated oil">
          <div className="test-history-grid"><table className="tests-table"><thead><tr><th>Date</th><th>Oil · bopd</th><th>Water · bwpd</th></tr></thead><tbody>{[...D.well_tests].reverse().map(t => <tr key={t.test_date}><td>{t.test_date}</td><td className="oil-text">{n(t.oil_rate_bopd)}</td><td>{n(t.water_rate_bwpd)}</td></tr>)}</tbody></table>
          <Chart height={178} option={lineOption(D.well_history.months, [{ name: 'Allocated oil', values: D.well_history.oil, color: C.oil }], 'Oil (bopd)')} /></div>
        </Card>
        <Card title="Extended operating tags" subtitle={`${w.name} · current time window · quality-qualified historian values`} extra={<label>Trend<select aria-label="Operating tag trend" value={detail.key} onChange={event => setDetailTag(event.target.value)}>{extendedTags.map(tag => <option key={tag.key} value={tag.key}>{tag.label}</option>)}</select></label>}>
          <Chart height={180} option={lineOption(hours, [{ name: detail.label, values: rt[detail.key], color: C.blue }], `${detail.label} (${detail.unit})`, ...operatingRange(rt[detail.key], detail.unit === 'psi' ? 20 : detail.unit === 'bwpd' ? 200 : 1))} />
        </Card>
      </div>
    </div>
  </>;
}
export function Surveillance() {
  const D = useDashboard();
  const [recent, setRecent] = useState(true);
  const p03 = D.patterns.find(p => p.id === D.selected.pattern) || D.patterns[0];
  const rt = recent ? D.pair.recent_realtime : D.pair.realtime, hours = rt.minute.map(m => Number((m / 60).toFixed(2)));
  const windowHours = (recent ? Math.min(D.runtime.minutes, 120) : D.runtime.minutes) / 60;
  const water = lineOption(hours, [{ name: `${D.pair.producer} · Water cut`, values: rt.wct, color: C.water }], 'Water cut (%)', ...operatingRange(rt.wct, 1));
  const pressure = lineOption(hours, [{ name: `${D.pair.injector} · WHIP`, values: rt.whip, color: C.injection }], 'WHIP (psi)', ...operatingRange(rt.whip, 20));
  for (const option of [water, pressure]) {
    const series = option.series as echarts.LineSeriesOption[];
    series[0].markLine = { symbol: 'none', label: { formatter: 'Now', color: '#556579' }, lineStyle: { color: '#A3AEBC', type: 'dashed' }, data: [{ xAxis: rt.minute.length - 1 }] };
  }
  return <>
    <div className="exception-grid">{D.events.slice(0, 4).map((e, i) => <div className={`exception ${e.severity === 'Critical' ? 'critical' : 'warning'}`} key={e.well}><div><strong>{e.well}</strong><Chip kind={e.severity === 'Critical' ? 'red' : 'amber'}>{e.severity}</Chip></div><h3>{e.value}</h3><p>{e.title} · recorded episode</p><span>{e.detail}</span><Spark values={i === 1 ? rt.wct : i === 0 ? [1850, 1880, 1860, 1840, 1900, 2240, 2240] : i === 2 ? [0, 1, 2, 3, 5, 6, 7.2] : [89, 90, 91, 92, 93, 94, 96]} color={e.severity === 'Critical' ? C.red : C.amber} /></div>)}</div>
    <div className="surveillance-grid"><Card title="Streaming pair surveillance" subtitle={`${D.pair.injector} → ${D.pair.producer} · ${p03.id} · ${n(windowHours)}-hour detail · labelled local axes`} extra={<select aria-label="Surveillance chart window" value={recent ? 'recent' : 'history'} onChange={e => setRecent(e.target.value === 'recent')}><option value="recent">Recent {n(Math.min(D.runtime.minutes, 120) / 60)}-hour detail</option><option value="history">Selected history</option></select>}>
      <div className="pair-summary"><div><span>PRODUCER</span><strong>{D.pair.producer}</strong><p>{n(rt.wct.at(-1)!, 1)}% WCT · {n(rt.liquid.at(-1)!)} bpd liquid</p></div><div className="connection-flow"><span>Geometric allocation</span><ArrowRightRegular /><small>{p03.id}</small></div><div><span>INJECTOR</span><strong>{D.pair.injector}</strong><p>{n(rt.injection.at(-1)!)} bwpd · {n(rt.whip.at(-1)!)} psi WHIP</p></div></div>
      <Chart height={204} option={water} /><Chart height={204} option={pressure} />
      <div className="notice"><ShieldCheckmarkRegular /><span>Rates balance at stock-tank conditions. {p03.id} instantaneous VRR <strong>{n(p03.vrr, 2)}</strong>.</span><a href={`./agent.html${location.search}`}>Review diagnosis →</a></div>
    </Card><div className="right-stack"><Card title="Event stream" subtitle="Latest exceptions and state changes" extra={<Chip>{D.events.length} open</Chip>}>
      <div className="event-list">{[...D.events].sort((a, b) => b.minute - a.minute).map(e => <div className="event" key={e.well}><div className={`event-dot ${e.severity === 'Critical' ? 'red-dot' : 'amber-dot'}`} /><div><div className="event-top"><strong>{e.well}</strong><h4>{e.title}</h4><span>{e.well === 'BG-0871' ? '03:12' : `−${n(4319 - e.minute)} min`}</span></div><div className="event-bottom"><p>{e.detail}</p><Chip kind={e.severity === 'Critical' ? 'red' : 'amber'}>{e.category}</Chip></div></div></div>)}</div>
    </Card><Card title="Watch rules" subtitle="Active per-tag evaluation · configure rules below"><div className="watch-grid"><div className="rule-row"><span>UG-0233 · WHIP</span><strong>&gt; 2,150 psi</strong></div><div className="rule-row"><span>SA-0352 · drift</span><strong>&gt; 0.3 psi/h</strong></div></div></Card></div></div>
  </>;
}
export function Quality() {
  const D = useDashboard();
  const q = D.quality;
  return <>
    <div className="kpi-grid five"><Kpi label="Records validated" value={n(q.records_validated)} detail="72-hour engineering acceptance" color={C.blue} icon={<ShieldCheckmarkRegular />} /><Kpi label="Tag-quality pass rate" value={n(q.pass_rate_pct, 2)} unit="%" detail="GOOD flags / all minute records" color={C.oil} /><Kpi label="Gauge-drift flags" value={n(q.gauge_drift_flags)} detail="SA-0352 · held for review" color={C.amber} /><Kpi label="Overdue well tests" value={n(q.overdue_tests)} detail="MN-0126 · 96 days" color={C.amber} /><Kpi label="Allocation mismatches" value={n(q.allocation_mismatches)} detail="UG-0310 · −6.8% vs separator" color={C.red} /></div>
    <div className="quality-grid"><Card title="Ingestion & calculation flows" subtitle="Nine scheduled local pipelines · persisted execution history" extra={<Chip kind="blue">Local Data Factory</Chip>}>
      <div className="flow-header"><span><DatabaseRegular /> Sources</span><ArrowRightRegular /><span>Bronze → Silver</span><ArrowRightRegular /><span>Gold / engineering</span></div>
      <table className="pipelines"><thead><tr><th>Pipeline / data flow</th><th>Schedule</th><th>Last run</th><th>Status</th></tr></thead><tbody>{q.pipelines.map((p, i) => <tr key={p.name}><td><div className="pipeline-name"><span>{String(i + 1).padStart(2, '0')}</span><div><strong>{p.name}</strong><small>{p.flow}</small></div></div></td><td>{p.schedule}</td><td>{p.last_run}</td><td><Chip kind="blue">{p.state}</Chip></td></tr>)}</tbody></table>
      <div className="notice"><DocumentRegular /><span>Pipeline definitions follow documented local ingestion and calculation flows. Gauge holds do not suppress valid rate measurements.</span></div>
    </Card><div className="right-stack"><Card title="QA/QC results" subtitle="Executed rule evaluation · rule-specific exceptions"><div className="quality-ring"><div><strong>{n(q.pass_rate_pct, 2)}<small>%</small></strong><span>Tag-quality completeness</span></div><p><i className="green-dot" /> {n(Math.round(q.records_validated * q.pass_rate_pct / 100))} GOOD<br /><i className="amber-dot" /> {n(Math.round(q.records_validated * (1 - q.pass_rate_pct / 100)))} SUSPECT</p></div>
      <table><thead><tr><th>Category</th><th>Checked</th><th>Exceptions</th><th>State</th></tr></thead><tbody>{q.rules.map(r => <tr key={r.category}><td>{r.category}</td><td>{n(r.checked)}</td><td>{n(r.issues)}</td><td><Chip kind={r.status === 'Healthy' ? 'green' : r.status === 'Hold' ? 'red' : 'amber'}>{r.status}</Chip></td></tr>)}</tbody></table>
    </Card><Card title="Open data issues" subtitle="Engineering action queue" extra={<Chip>{q.issues.length} unresolved</Chip>}><div className="issue-list">{q.issues.map(issue => <div className="issue" key={issue.well}><div><strong>{issue.well}</strong><Chip kind="amber">{issue.severity}</Chip></div><p>{issue.issue}</p><span>{issue.action} · {issue.owner}</span></div>)}</div></Card></div></div>
  </>;
}
function Agent() {
  const D = useDashboard();
  const a = D.agent;
  const hall: EChartsOption = { grid: { left: 65, right: 25, top: 40, bottom: 42 }, legend: { data: ['WHIP integral'], top: 0, left: 20 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', name: 'Cumulative injection (bbl)', nameLocation: 'middle', nameGap: 27, min: 0, axisLabel: { formatter: (v: number) => `${n(v / 1000)}k` } },
    yAxis: { type: 'value', name: 'WHIP integral (psi·day)', nameLocation: 'middle', nameRotate: 90, nameGap: 44, min: 0, axisLabel: { formatter: (v: number) => `${n(v / 1000)}k` }, splitLine: { lineStyle: { color: '#EDF0F4' } } },
    series: [{ name: 'WHIP integral', type: 'line', showSymbol: false, data: a.hall.volume.map((v, i) => [v, a.hall.pressure_integral[i]]), lineStyle: { color: C.injection, width: 3 }, itemStyle: { color: C.injection } }] };
  const chan: EChartsOption = { grid: { left: 55, right: 28, top: 33, bottom: 43 }, legend: { top: 0, left: 20 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'log', name: 'Days (log scale)', nameLocation: 'middle', nameGap: 27, min: 1, max: 100 },
    yAxis: { type: 'log', name: 'WOR / WOR′ (1/day)', nameLocation: 'middle', nameRotate: 90, nameGap: 39, min: .0001, max: 10, splitLine: { lineStyle: { color: '#EDF0F4' } } },
    series: [{ name: 'WOR', type: 'line', showSymbol: false, data: a.chan.day.map((d, i) => [d, a.chan.wor[i]]), lineStyle: { color: C.water, width: 2.5 }, itemStyle: { color: C.water } },
      { name: 'WOR′', type: 'line', showSymbol: false, data: a.chan.day.map((d, i) => [d, Math.max(a.chan.derivative[i], .0001)]), lineStyle: { color: C.amber, width: 2 }, itemStyle: { color: C.amber } }] };
  return <div className="agent-grid"><Card title="Waterflood agent" subtitle="Engineering evidence. Engineer-controlled decisions." extra={<Chip kind="purple"><SparkleRegular /> Context retained</Chip>} className="conversation">
    <div className="agent-context"><Chip>Raudhatain</Chip><Chip>Mauddud</Chip><Chip>RA-P03</Chip><Chip>RA-0417 / RA-0731</Chip></div>
    <div className="user-message"><Avatar name="Reservoir Engineer" size={28} /><div>Why has water cut jumped on RA-0417 and what should we change on RA-0731?</div></div>
    <div className="tool-trace"><div><SparkleRegular /><strong>Evidence assembled from the design dataset</strong><Chip kind="purple">Reference reasoning</Chip></div><p>72-hour tags · 30-day allocation context · well completion / PLT interpretation</p><div className="tool-pills">{['Time series', 'Well & pattern', 'Hall integral', 'Chan diagnostic', 'CRM parameters'].map(t => <span key={t}><CheckmarkCircleRegular />{t}</span>)}</div></div>
    <div className="agent-answer"><div className="answer-heading"><span className="agent-orb"><SparkleRegular /></span><strong>Preferential flow in upper Mauddud</strong><Chip kind="red">Channelling indication</Chip></div>
      <p>RA-0417 water cut rose from <b>{n(a.prior_wc_pct)}% to {n(a.current_wc_pct)}%</b> over 48 hours while RA-0731 WHIP increased <b>{n(a.whip_increase_psi)} psi</b>. The evidence is consistent with a high-permeability connection, rather than a field-wide pressure change.</p>
      <div className="evidence-stats"><div><span>Hall slope since 2 Nov</span><strong className="teal-text">{n(a.hall_slope_change_pct)}%</strong></div><div><span>CRM gain / mean</span><strong>{n(a.crm_gain, 2)} <small>/ {n(a.pattern_mean_gain, 2)}</small></strong></div><div><span>Pattern VRR</span><strong className="red-text">{n(a.pattern_vrr, 2)}</strong></div></div>
      <p>The rising WOR derivative supports channelling. The reference PLT interpretation attributes <b>{D.plt_water_contribution_pct}%</b> of water to the upper interval. Review RA-0417 upper ICDs before a conformance intervention.</p>
      <div className="source-chips">{a.sources.map(s => <span key={s}><DatabaseRegular />{s}</span>)}</div>
    </div>
    <div className="recommendation"><div className="recommendation-title"><ShieldCheckmarkRegular /><strong>Proposed injection reallocation</strong><Chip kind="amber">Approval required</Chip></div>
      <table><thead><tr><th>Injector</th><th>Current · bwpd</th><th>Proposed · bwpd</th><th>Change</th></tr></thead><tbody>{a.recommendation.map(r => <tr key={r.well}><td><strong>{r.well}</strong></td><td>{n(r.current_bwpd)}</td><td><strong>{n(r.proposed_bwpd)}</strong></td><td className={r.proposed_bwpd < r.current_bwpd ? 'red-text' : 'teal-text'}>{r.proposed_bwpd > r.current_bwpd ? '+' : ''}{n(r.proposed_bwpd - r.current_bwpd)}</td></tr>)}</tbody></table>
      <div className="recommendation-bottom"><span>Total injection unchanged · RA-0731 WHIP &lt; 2,150 psi</span><Tooltip content="Unavailable until design approval. No action has been taken." relationship="description"><Button disabled appearance="primary" icon={<LockClosedRegular />}>Approve change request</Button></Tooltip></div>
    </div>
    <div className="chat-compose"><span>Ask a follow-up about pattern pressure or ICDs…</span><Button disabled icon={<SendRegular />} aria-label="Send question" /></div><div className="chat-foot"><LockClosedRegular /> Static design review · no tool execution, change request or channel post</div>
  </Card><div className="right-stack">
    <Card title="Hall injectivity diagnostic" subtitle="RA-0731 · integral derived from daily WHIP and injection" extra={<Chip kind="teal">{n(a.hall_slope_change_pct)}% slope</Chip>}><Chart option={hall} height={180} /></Card>
    <Card title="Chan water–oil diagnostic" subtitle="RA-0417 · positive WOR′ rises after breakthrough"><Chart option={chan} height={180} /></Card>
    <Card title="90-day reference forecast" subtitle="Not an executed optimizer result" extra={<Chip kind="purple">P50 · conditional</Chip>}><div className="forecast-metrics"><div><span>Incremental oil at day {a.forecast.days}</span><strong className="oil-text">+{n(a.forecast.p50_oil_uplift_bopd)} <small>bopd</small></strong></div><div><span>Pattern VRR at day {a.forecast.days}</span><strong>{n(a.forecast.p50_pattern_vrr, 2)}</strong></div></div><p className="forecast-note">{a.forecast.assumptions}</p><div className="approval-state"><ShieldCheckmarkRegular /><div><strong>{a.approval_state}</strong><p>No changes made. An approved request would create an audit record and watch rule in a later phase.</p></div></div></Card>
  </div></div>;
}
function App() {
  const D = useDashboard();
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  const screens: Record<string, React.ReactNode> = { 'operations-overview': <Overview />, 'fields-and-patterns': <Patterns />, 'well-360': <Well />, 'live-surveillance': <Surveillance />, 'data-quality-and-pipelines': <Quality />, agent: <Agent /> };
  return <FluentProvider theme={webLightTheme}><div className="shell">
    <header className="topbar"><div className="fabric-mark" aria-label="Fabric"><i /><i /><i /></div><strong className="fabric-word">Fabric</strong><span className="top-divider" /><span className="top-breadcrumb">Energy intelligence <span>/</span> <b>Waterflood Intelligence</b></span><div className="global-search"><SearchRegular /><span>Search assets, wells and insights</span><kbd>Ctrl K</kbd></div><div className="top-status"><span className="live-dot" />LIVE <span className="stream-time">{time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div><Button appearance="subtle" icon={<AlertRegular />} aria-label="Notifications" disabled /><Avatar name="Reservoir Engineer" size={32} color="colorful" /></header>
    <aside className="rail"><div className="rail-active"><HomeRegular /><span>Home</span></div><div><GridRegular /><span>Workspaces</span></div><div><DatabaseRegular /><span>OneLake</span></div><div><PulseRegular /><span>Real-Time</span></div><div className="rail-bottom"><SettingsRegular /><span>Settings</span></div></aside>
    <nav className="sidebar"><div className="workspace-heading"><div className="workspace-icon">WI</div><div><strong>Waterflood Intelligence</strong><span>Engineering workspace</span></div></div><span className="nav-caption">SURVEILLANCE</span>{pageList.map(([key, title, Icon]) => <a className={`nav-item ${current === key ? 'active' : ''}`} href={`./${key}.html`} key={key}><Icon /><span>{title}</span>{key === 'live-surveillance' && <b>{D.events.length}</b>}{key === 'agent' && <span className="purple-nav-dot" />}</a>)}<span className="nav-caption future-caption">PLANNING</span><div className="nav-item disabled"><ArrowTrendingRegular /><span>Optimisation</span><LockClosedRegular /></div><div className="nav-item disabled"><DocumentRegular /><span>Work management</span><LockClosedRegular /></div>
      <div className="workspace-bottom"><ShieldCheckmarkRegular /><strong>Design review</strong><p>Engineering datasets validated.<br />Awaiting design approval.</p><div><i className="green-dot" /> Local workspace</div></div>
    </nav>
    <main><div className="page-heading"><div><div className="eyebrow">WATERFLOOD INTELLIGENCE <span>/</span> {focused ? 'RAUDHATAIN · MAUDDUD' : 'KUWAIT ASSET PORTFOLIO'}</div><h1>{page[1]}</h1><p>{current === 'operations-overview' ? 'Production, pressure maintenance and exceptions across your asset.' : current === 'agent' ? 'From operational evidence to an engineer-approved decision.' : current === 'data-quality-and-pipelines' ? 'Confidence in every record. Visibility into every data flow.' : current === 'well-360' ? 'One well. Every dimension of its performance.' : current === 'live-surveillance' ? 'Stay ahead of breakthrough, pressure excursions and equipment events.' : 'Understand sweep, connectivity and pressure support at pattern level.'}</p></div><div className="heading-actions"><Button appearance="subtle" icon={<ClockRegular />} disabled>72-hour window</Button><Button icon={<ArrowDownloadRegular />} disabled>Export</Button></div></div>
      <div className="filters"><span className="filter-label"><FilterRegular />Context</span>{[focused ? 'Raudhatain' : 'All six fields', focused ? 'Mauddud' : 'All reservoirs', current === 'well-360' ? 'RA-0417 · Producer' : 'Producers + injectors', 'Last 72 hours'].map((label, i) => <span className="filter-control" key={label}><small>{['Field', 'Reservoir', 'Well type / asset', 'Time window'][i]}</small>{label}<ChevronDownRegular /></span>)}<span className="filters-end"><i className="green-dot" /> Common engineering source</span></div>
      <div className={`page-content ${current}`}>{screens[current] || <Overview />}</div>
      <footer className="page-footer"><span><DatabaseRegular /> Engineering source snapshot · {D.as_of} · 72-hour replay window</span><span>Static design review · no connected operational services</span><span>Oilfield units · WGS 84</span></footer>
    </main>
  </div></FluentProvider>;
}
