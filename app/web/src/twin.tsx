import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Sky, useTexture } from '@react-three/drei';
import type { OrbitControls as Controls } from 'three-stdlib';
import * as THREE from 'three';
import { api, navigate, useDashboard } from './context';
import { baseUrl } from './static-runtime';

type Point = [number, number, number];
type Terrain = { field: string; grid_size: number; elevation_m: number[][]; mercator_bounds: number[]; wgs84_bounds: number[];
  terrain_min_m: number; terrain_max_m: number; tile_ground_spacing_m: number; basis: string };
function mercator(lon: number, lat: number): [number, number] {
  return [6378137 * lon * Math.PI / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
}
function Box({ position, size, color, metal = 0 }: { position: Point; size: Point; color: string; metal?: number }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={metal ? .48 : .9} metalness={metal} /></mesh>;
}
function Pipe({ position, length, radius = .12, axis = 'y', color = '#69786A' }: { position: Point; length: number; radius?: number; axis?: 'x' | 'y' | 'z'; color?: string }) {
  return <mesh position={position} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, length, 12]} /><meshStandardMaterial color={color} roughness={.52} metalness={.6} /></mesh>;
}
function Wellsite({ position, name, injector, detailed, select }: { position: Point; name: string; injector: boolean; detailed: boolean; select: () => void }) {
  const paint = injector ? '#216D7A' : '#536E43';
  return <group position={position} onClick={e => { e.stopPropagation(); select(); }}>
    <Box position={[0, .08, 0]} size={[30, .16, 40]} color="#C6BDA6" />
    <Box position={[0, .2, 0]} size={[3.5, .25, 3.5]} color="#B7B6AC" />
    <Pipe position={[0, 1.45, 0]} length={2.8} radius={.24} color={paint} />
    {[.5, 1.2, 1.9, 2.7].map(h => <Pipe key={h} position={[0, h, 0]} length={.14} radius={.38} color={paint} />)}
    <Pipe position={[.9, 1.8, 0]} length={1.8} axis="x" color={paint} />
    <Pipe position={[-.6, 2.3, 0]} length={1.2} axis="x" color={paint} />
    <Box position={[8, 1.5, 6]} size={[3, 2.7, 2.3]} color="#D7D7CB" metal={.25} />
    {detailed && <>
      {[.75, 1.6, 2.4].map(h => <group key={h} position={[0, h, .55]}>
        <Pipe position={[0, 0, 0]} length={.7} axis="z" radius={.1} color="#7C817C" />
        <mesh position={[0, 0, .42]} castShadow><torusGeometry args={[.29, .035, 8, 20]} /><meshStandardMaterial color="#A3372F" metalness={.5} roughness={.45} /></mesh>
      </group>)}
      {[.5, 1.2, 1.9, 2.7].flatMap(h => Array.from({ length: 6 }, (_, i) => <Pipe key={`${h}:${i}`} position={[Math.cos(i * Math.PI / 3) * .31, h, Math.sin(i * Math.PI / 3) * .31]} length={.2} radius={.045} color="#969B94" />))}
      <Pipe position={[1.9, 1.1, 0]} length={1.4} radius={.13} color={paint} />
      <Pipe position={[5, .42, 0]} length={6.2} axis="x" radius={.13} color={paint} />
      <Pipe position={[8.1, .42, 5]} length={10} axis="z" radius={.13} color={paint} />
      {[3, 6, 8].map(x => <Box key={x} position={[x, .22, 0]} size={[.55, .38, .7]} color="#999D97" />)}
      <Box position={[8, .4, 6]} size={[3.5, .55, 2.7]} color="#414946" metal={.6} />
      {Array.from({ length: 7 }, (_, i) => <Box key={i} position={[8.1, .8 + i * .23, 7.17]} size={[1.9, .07, .08]} color="#4B5552" />)}
      <Box position={[7.6, 2.1, 7.18]} size={[.5, .38, .1]} color="#31535D" />
      <Box position={[-9, 1.55, 10]} size={[7, 2.9, 3.3]} color="#DCDDD2" metal={.2} />
      <Box position={[-9, 3.02, 10]} size={[7.4, .14, 3.6]} color="#8F968F" metal={.4} />
      <Box position={[-7.2, 1.4, 11.7]} size={[1.1, 2.2, .12]} color="#BAC2B9" />
      <Box position={[-10.7, 1.85, 11.7]} size={[1.5, .9, .12]} color="#415A63" metal={.25} />
      <Pipe position={[-13, 3.2, 12]} length={6.3} radius={.07} color="#7F8982" />
      <Box position={[-13, 6.35, 12]} size={[.7, .22, .6]} color="#DFDFC6" />
      {[-14.5, 14.5].map(x => <group key={x}>
        {Array.from({ length: 9 }, (_, i) => <Pipe key={i} position={[x, .8, -19 + i * 4.75]} length={1.6} radius={.04} color="#AA9855" />)}
        <Pipe position={[x, 1.5, 0]} length={38} axis="z" radius={.035} color="#C1AB53" />
        <Pipe position={[x, .8, 0]} length={38} axis="z" radius={.025} color="#B3A67B" />
      </group>)}
      <Html position={[0, 7, -8]} center><div className="twin-label">{name}<small>{injector ? 'Injection wellhead / flowline' : 'ESP wellhead / VSD cabinet'}</small></div></Html>
    </>}
  </group>;
}
function Camera({ target, distance, controls, revision }: { target: Point; distance: number; controls: React.RefObject<Controls>; revision: number }) {
  const camera = useThree(state => state.camera);
  useEffect(() => {
    camera.position.set(target[0] + distance, target[1] + distance * .65, target[2] + distance * .9);
    if (camera instanceof THREE.PerspectiveCamera) { camera.far = 100000; camera.near = .1; camera.updateProjectionMatrix(); }
    camera.lookAt(...target);
    controls.current?.target.set(...target);
    controls.current?.update();
  }, [camera, target[0], target[1], target[2], distance, controls, revision]);
  return null;
}
function TerrainMesh({ terrain, base, scale, prefix }: { terrain: Terrain; base: number; scale: number; prefix: string }) {
  const texture = useTexture(`${baseUrl}assets/terrain-texture-${prefix}.jpg`);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = useMemo(() => {
    const n = terrain.grid_size, [west, south, east, north] = terrain.mercator_bounds;
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
      positions.push((col / (n - 1) - .5) * (east - west) * scale, terrain.elevation_m[row][col] - base, (row / (n - 1) - .5) * (north - south) * scale);
      uv.push(col / (n - 1), 1 - row / (n - 1));
      if (row < n - 1 && col < n - 1) { const a = row * n + col; indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    result.setIndex(indices); result.computeVertexNormals();
    return result;
  }, [terrain, base, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial map={texture} roughness={1} side={THREE.DoubleSide} /></mesh>;
}
export default function DigitalTwin() {
  const D = useDashboard(), prefix = D.selected.name.slice(0, 2);
  const [terrain, setTerrain] = useState<Terrain | null>(null), [error, setError] = useState(''), [fieldView, setFieldView] = useState(false);
  const [fit, setFit] = useState(0);
  const controls = useRef<Controls>(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const controller = new AbortController(); setTerrain(null); setError(''); setFieldView(false);
    api<Terrain>(`/assets/terrain-${prefix}.json`, undefined, controller.signal).then(setTerrain)
      .catch(e => { if (!controller.signal.aborted) setError(`Real terrain unavailable: ${e}`); });
    return () => controller.abort();
  }, [prefix]);
  if (!terrain) return <div className="loading-state" role={error ? 'alert' : 'status'}>{error || 'Loading cached real terrain and satellite surface…'}</div>;
  const [west, south, east, north] = terrain.mercator_bounds;
  const scale = Math.cos((terrain.wgs84_bounds[1] + terrain.wgs84_bounds[3]) / 2 * Math.PI / 180);
  const elevation = (lon: number, lat: number) => {
    const [x, y] = mercator(lon, lat), n = terrain.grid_size;
    const gx = Math.max(0, Math.min(n - 1, (x - west) / (east - west) * (n - 1)));
    const gy = Math.max(0, Math.min(n - 1, (north - y) / (north - south) * (n - 1)));
    const col = Math.min(n - 2, Math.floor(gx)), row = Math.min(n - 2, Math.floor(gy)), fx = gx - col, fy = gy - row;
    return terrain.elevation_m[row][col] * (1 - fx) * (1 - fy) + terrain.elevation_m[row][col + 1] * fx * (1 - fy)
      + terrain.elevation_m[row + 1][col] * (1 - fx) * fy + terrain.elevation_m[row + 1][col + 1] * fx * fy;
  };
  const base = elevation(D.selected.lon, D.selected.lat);
  const wells = D.wells.filter(w => w.field === D.selected.field).map(w => {
    const [x, y] = mercator(w.lon, w.lat);
    return { ...w, position: [(x - (west + east) / 2) * scale, elevation(w.lon, w.lat) - base, ((south + north) / 2 - y) * scale] as Point };
  });
  const selected = wells.find(w => w.name === D.selected.name)!;
  const span = Math.max(east - west, north - south) * scale;
  const target: Point = fieldView ? [0, 0, 0] : selected.position;
  return <div className="geological-workspace">
    <div className="viewer-controls"><strong>{D.selected.field} · {wells.length} wellsites on real terrain</strong>
      <button onClick={() => { setFieldView(false); setFit(n => n + 1); }}>Inspect selected wellsite</button><button onClick={() => { setFieldView(true); setFit(n => n + 1); }}>Fit entire field</button>
      <span>Terrain {terrain.terrain_min_m.toFixed(1)}–{terrain.terrain_max_m.toFixed(1)} m · relief 1×</span></div>
    <div className="scene asset-scene twin-scene" data-twin="true" data-well-count={wells.length} data-terrain-source="Mapzen/USGS">
      <Canvas shadows camera={{ position: [90, 60, 80], fov: 45, near: .1, far: 100000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => { gl.setClearColor('#B4C8D1'); gl.toneMappingExposure = .9; }}>
        <Sky sunPosition={[100, 45, 70]} turbidity={5} rayleigh={1.5} />
        <hemisphereLight args={['#DAE8F0', '#9D8867', .9]} />
        <primitive object={lightTarget} position={selected.position} />
        <directionalLight target={lightTarget} position={[selected.position[0] + 50, selected.position[1] + 100, selected.position[2] + 40]} intensity={2} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={250} shadow-bias={-.0001} />
        <TerrainMesh terrain={terrain} base={base} scale={scale} prefix={prefix} />
        {wells.map(w => <group key={w.name}>
          <Wellsite name={w.name} position={w.position} injector={w.type === 'injector'} detailed={w.name === D.selected.name && !fieldView} select={() => navigate('digital-twin', w.name)} />
          {fieldView && <Html position={w.position} center><button className="twin-field-marker" onClick={() => { setFieldView(false); setFit(n => n + 1); navigate('digital-twin', w.name); }}>{w.name}</button></Html>}
        </group>)}
        <OrbitControls ref={controls} makeDefault enableDamping minDistance={8} maxDistance={span * 3} maxPolarAngle={Math.PI / 2.03} />
        <Camera controls={controls} target={target} distance={fieldView ? span * 1.25 : 38} revision={fit} />
      </Canvas>
      <div className="scene-note"><span className="chip white">Real terrain + historical satellite surface</span><span>Illustrative equipment · indicative well positions · not photogrammetry</span></div>
      <div className="twin-metrics"><strong>{selected.name}</strong><span>{selected.type === 'injector' ? `${selected.inj_bwpd.toLocaleString('en-US', { maximumFractionDigits: 0 })} bwpd injection` : `${selected.oil_bopd.toLocaleString('en-US', { maximumFractionDigits: 0 })} bopd oil`}</span>
        <span>{selected.type === 'injector' ? `WHIP ${selected.whip_psi?.toFixed(0)} psi` : `Water cut ${selected.water_cut_pct?.toFixed(1)}%`}</span><span>Ground elevation {base.toFixed(1)} m</span></div>
    </div>
    <p className="viewer-basis">Terrain: Mapzen Terrain Tiles, SRTM/GMTED2010 courtesy USGS; approximately {terrain.tile_ground_spacing_m.toFixed(0)} m tile spacing, resampled for display. Satellite: EOxCloudless / EOX, modified Copernicus 2016 &amp; 2017, CC BY 4.0. Equipment and pads are illustrative, informed by inspected Kuwait wellsite reference photography, not a survey-accurate reconstruction. The ESP pump itself is downhole, not an above-ground pumpjack.</p>
  </div>;
}
