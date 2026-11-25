import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, useBounds, OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { api, navigate, useDashboard } from './context';

type Point = [number, number, number];
type Model = {
  wells: { name: string; field: string; reservoir: string; type: string; points: Point[];
    completion: { intervals: { tvdss_top_ft: number; tvdss_base_ft: number }[] } }[];
  surfaces: { id: string; field: string; formation: string; vertices: Point[]; triangles: number[][] }[];
  basis: string;
};
const palette = ['#84AD9F', '#54A6AD', '#D1AD78', '#9C8EC1', '#A8AA80', '#78A4C8'];
function Fit({ revision }: { revision: number }) {
  const bounds = useBounds();
  useEffect(() => { bounds.refresh().fit(); }, [bounds, revision]);
  return null;
}
function Surface({ surface, exaggeration, color }: { surface: Model['surfaces'][number]; exaggeration: number; color: string }) {
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(surface.vertices.flatMap(([x, y, z]) => [x, y * exaggeration, z]), 3));
    result.setIndex(surface.triangles.flat());
    result.computeVertexNormals();
    return result;
  }, [surface, exaggeration]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color={color} transparent opacity={.24} side={THREE.DoubleSide} depthWrite={false} /></mesh>;
}
export default function GeologicalScene() {
  const D = useDashboard(), [model, setModel] = useState<Model | null>(null), [error, setError] = useState('');
  const [hidden, setHidden] = useState<string[]>([]), [showWells, setShowWells] = useState(true), [labels, setLabels] = useState(false);
  const [exaggeration, setExaggeration] = useState(10), [fit, setFit] = useState(0);
  const workspace = useRef<HTMLDivElement>(null), [viewerError, setViewerError] = useState('');
  const { filter_field, filter_reservoir, filter_well_type } = D.runtime;
  useEffect(() => {
    const controller = new AbortController();
    setModel(null); setError(''); setHidden([]);
    const params = new URLSearchParams({ field: filter_field, reservoir: filter_reservoir, well_type: filter_well_type });
    api<Model>(`/api/geology?${params}`, undefined, controller.signal).then(setModel)
      .catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [filter_field, filter_reservoir, filter_well_type]);
  const formations = [...new Set(model?.surfaces.map(s => s.formation))];
  if (!model) return <div className="scene loading-state" role={error ? 'alert' : 'status'}>{error || 'Loading all wells and formation surfaces…'}</div>;
  const surfaces = model.surfaces.filter(s => !hidden.includes(s.formation));
  return <div className="geological-workspace" ref={workspace}>
    <div className="viewer-controls">
      <strong>{model.wells.length} wells · {surfaces.length}/{model.surfaces.length} field surfaces</strong>
      <label><input type="checkbox" checked={showWells} onChange={e => setShowWells(e.target.checked)} />Wells</label>
      <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} />Well labels</label>
      <label>Vertical exaggeration<select aria-label="Vertical exaggeration" value={exaggeration} onChange={e => setExaggeration(Number(e.target.value))}>{[1, 5, 10, 20].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
      <button onClick={() => setFit(n => n + 1)}>Fit to view</button>
      <button onClick={() => { workspace.current?.requestFullscreen().catch(e => setViewerError(String(e))); }}>Expand viewer</button>
      <button onClick={() => { setHidden([]); setShowWells(true); setFit(n => n + 1); }}>Show all surfaces and wells</button>
    </div>
    {viewerError && <p role="alert">{viewerError}</p>}
    <div className="scene asset-scene" data-scene="true" data-well-count={model.wells.length} data-surface-count={surfaces.length}>
      <Canvas camera={{ position: [140, 95, 130], fov: 44 }} gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => gl.setClearColor('#EDF3F6')}>
        <ambientLight intensity={1.7} /><directionalLight position={[80, 90, 60]} intensity={2} />
        <gridHelper args={[200, 40, '#B7C6D1', '#DCE5EB']} />
        <Bounds fit clip observe margin={1.18}>
          {surfaces.map(s => <Surface key={s.id} surface={s} exaggeration={exaggeration} color={palette[formations.indexOf(s.formation) % palette.length]} />)}
          {showWells && model.wells.map(w => {
            const points = w.points.map(([x, y, z]) => [x, y * exaggeration, z] as Point), focused = w.name === D.selected.name;
            return <group key={w.name}>
              <Line points={points} color={focused ? '#0F6CBD' : w.type === 'injector' ? '#00A2AD' : '#107C10'} lineWidth={focused ? 4 : 2}
                onClick={e => { e.stopPropagation(); navigate('well-360', w.name); }} />
              <mesh position={points[0]} onClick={e => { e.stopPropagation(); navigate('well-360', w.name); }}>
                <sphereGeometry args={[focused ? .45 : .23, 8, 8]} /><meshStandardMaterial color={focused ? '#0F6CBD' : w.type === 'injector' ? '#00A2AD' : '#107C10'} />
              </mesh>
              {(labels || focused) && <Html position={points[0]} center><button className={`trajectory-label ${focused ? 'focused' : ''}`} onClick={() => navigate('well-360', w.name)}>{w.name}</button></Html>}
            </group>;
          })}
          <Fit revision={fit + exaggeration} />
        </Bounds>
        <OrbitControls makeDefault enableDamping minDistance={2} maxDistance={700} />
      </Canvas>
      <div className="scene-note"><span className="chip white">Data-derived geological interpretation</span><span>All visible fields in one coordinate system · km · north is −Z</span></div>
      <div className="formation-key"><strong>Formation surface visibility</strong>{formations.map((formation, index) => <label key={formation}>
        <input type="checkbox" checked={!hidden.includes(formation)} onChange={e => setHidden(e.target.checked ? hidden.filter(n => n !== formation) : [...hidden, formation])} />
        <i style={{ background: palette[index % palette.length] }} />{formation}</label>)}</div>
      <div className="scene-legend"><span>Blue: selected well</span><span>Teal: injector</span><span>Green: producer</span><span>Depth exaggerated {exaggeration}× · select a well to inspect</span></div>
    </div>
    <div className="viewer-inspection"><strong>{D.selected.name}</strong><span>{D.selected.field} / {D.selected.reservoir}</span>
      <span>MD {D.selected.md_ft.toLocaleString()} ft · TVDSS {D.selected.depth_tvdss_ft.toLocaleString()} ft</span>
      <button onClick={() => navigate('well-trends', D.selected.name)}>Open Well trends</button></div>
    <p className="viewer-basis">{model.basis} Surface patches follow available markers within each field; no surface is extrapolated across unsurveyed gaps between fields.</p>
  </div>;
}
