import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { PerformanceMonitor } from '@react-three/drei'
import { CAMERA_PRESETS, type CameraPresetId, Scene } from './Scene'
import { advanceSimulationTime, getSolarSystemSnapshot, MAX_SIMULATION_TIME, MIN_SIMULATION_TIME } from './astro'
import { formatDateInput, parseDateInput, PLAYBACK_RATES, SCALE_MODES, type ScaleMode, type SimulationState } from './simulation'
import type { StellarSelection } from './StellarScene'
import { percentile95 } from './performance'

const SolarScene = lazy(() => import('./SolarScene'))
const StellarScene = lazy(() => import('./StellarScene'))
const xrStore = createXRStore({ controller: { rayPointer: true, teleportPointer: false } })

const RATE_LABELS = new Map<number, string>([
  [-86_400, '−1 天/秒'], [-3_600, '−1 小时/秒'], [0, '实时'], [3_600, '1 小时/秒'], [86_400, '1 天/秒'], [2_592_000, '30 天/秒'],
])
type GaiaLandmark = { id: string; label: string; englishLabel: string; sourceId: string; distancePc: number; radialVelocityKnown: boolean }

function FrameProbe({ onSample }: { onSample: (p95Ms: number) => void }) {
  const samples = useRef<number[]>([])
  useFrame((_, delta) => {
    if (delta <= 0.1) samples.current.push(delta * 1_000)
    if (samples.current.length >= 180) {
      const p95 = percentile95(samples.current)
      samples.current.length = 0
      if (p95 != null) onSample(p95)
    }
  })
  return null
}

export function App() {
  const [annotations, setAnnotations] = useState(false)
  const [skyReady, setSkyReady] = useState(false)
  const [forecastClouds, setForecastClouds] = useState(false)
  const [cloudStatus, setCloudStatus] = useState('静态卫星云层')
  const [stellarStatus, setStellarStatus] = useState('Gaia 数据按需加载')
  const [stellarSelection, setStellarSelection] = useState<StellarSelection | null>(null)
  const [landmarks, setLandmarks] = useState<GaiaLandmark[]>([])
  const [preset, setPreset] = useState<CameraPresetId>('orbit')
  const [trueScale, setTrueScale] = useState(false)
  const [showSmallBodies, setShowSmallBodies] = useState(false)
  const [dprCap, setDprCap] = useState(() => /OculusBrowser|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1.15 : 1.65)
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [simulation, setSimulation] = useState<SimulationState>(() => ({ utcMs: Date.now(), paused: true, rate: 86_400, mode: 'earth' }))
  const [quality] = useState(() => /OculusBrowser|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' as const : 'desktop' as const)
  const handleSkyReady = useCallback(() => setSkyReady(true), [])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}assets/stars/gaia/landmarks.json`).then((response) => response.ok ? response.json() : []).then(setLandmarks).catch(() => setLandmarks([]))
  }, [])

  useEffect(() => {
    if (simulation.paused || simulation.rate === 0) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) / 1_000
      previous = now
      setSimulation((current) => ({ ...current, utcMs: advanceSimulationTime(current.utcMs, delta, current.rate) }))
    }, 100)
    return () => window.clearInterval(timer)
  }, [simulation.paused, simulation.rate])

  const solarSnapshot = useMemo(() => simulation.mode === 'solar' ? getSolarSystemSnapshot(simulation.utcMs) : [], [simulation.mode, simulation.utcMs])
  const selectedBody = solarSnapshot.find((body) => body.id === simulation.selectedObjectId)
  const selectedDistance = selectedBody ? Math.hypot(...selectedBody.positionAu) : null

  const setMode = (mode: ScaleMode) => {
    setStellarSelection(null)
    setSimulation((current) => ({ ...current, mode, selectedObjectId: mode === 'solar' ? 'earth' : undefined }))
  }
  const setDate = (value: string) => {
    const parsed = parseDateInput(value)
    if (parsed != null) setSimulation((current) => ({ ...current, utcMs: parsed }))
  }
  const resetNow = () => setSimulation((current) => ({ ...current, utcMs: Math.min(MAX_SIMULATION_TIME, Math.max(MIN_SIMULATION_TIME, Date.now())) }))
  const selectStellar = useCallback((selection: StellarSelection) => {
    setStellarSelection(selection)
    setSimulation((current) => ({ ...current, selectedObjectId: selection.id }))
  }, [])

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const query = search.trim().toLowerCase()
    if (!query) return
    const body = getSolarSystemSnapshot(simulation.utcMs).find((item) => item.id === query || item.label === search.trim() || item.englishLabel.toLowerCase() === query)
    if (body) {
      setSimulation((current) => ({ ...current, mode: 'solar', selectedObjectId: body.id }))
      setSearch('')
      return
    }
    const landmark = landmarks.find((item) => item.id === query || item.label === search.trim() || item.englishLabel.toLowerCase().includes(query))
    if (landmark) {
      setStellarSelection({ id: landmark.sourceId, label: `${landmark.label} · ${landmark.englishLabel}`, distancePc: landmark.distancePc, radialVelocityKnown: landmark.radialVelocityKnown, position: [0, 0, 0] })
      setSimulation((current) => ({ ...current, mode: 'stellar', selectedObjectId: landmark.sourceId }))
      setSearch('')
      return
    }
    if (/^\d{8,}$/.test(query)) {
      setSimulation((current) => ({ ...current, mode: 'stellar', selectedObjectId: query }))
      setSearch('')
    }
  }

  return <main className={`experience mode-${simulation.mode}`}>
    <Canvas camera={{ position: [0, 1.25, 9], fov: 48, near: 0.01, far: 180 }} dpr={[quality === 'mobile' ? 0.8 : 1, dprCap]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <PerformanceMonitor flipflops={3} onDecline={() => setDprCap((current) => Math.max(quality === 'mobile' ? 0.9 : 1, current - 0.15))} onIncline={() => setDprCap((current) => Math.min(quality === 'mobile' ? 1.15 : 1.65, current + 0.08))}>
      <FrameProbe onSample={setFrameP95} />
      <XR store={xrStore}><Suspense fallback={null}>
        {simulation.mode === 'earth' && <Scene annotations={annotations} forecastClouds={forecastClouds} preset={preset} quality={quality} utcMs={simulation.utcMs} onPresetChange={setPreset} onSkyReady={handleSkyReady} onCloudStatus={setCloudStatus} />}
        {simulation.mode === 'solar' && <SolarScene utcMs={simulation.utcMs} selectedObjectId={simulation.selectedObjectId} trueScale={trueScale} showSmallBodies={showSmallBodies} quality={quality} onSelect={(id) => setSimulation((current) => ({ ...current, selectedObjectId: id }))} />}
        {simulation.mode === 'stellar' && <StellarScene utcMs={simulation.utcMs} quality={quality} selectedObjectId={simulation.selectedObjectId} onSelect={selectStellar} onStatus={setStellarStatus} />}
      </Suspense></XR>
      </PerformanceMonitor>
    </Canvas>

    <header className="title-block"><p>ASTRONOMICAL EXPLORER</p><h1>{SCALE_MODES.find((mode) => mode.id === simulation.mode)?.label}</h1><span>Earth · Solar System · 100 pc</span></header>

    <nav className="scale-navigation" aria-label="尺度导航">
      {SCALE_MODES.map((mode, index) => <button key={mode.id} className={simulation.mode === mode.id ? 'active' : ''} onClick={() => setMode(mode.id)}><small>0{index + 1}</small>{mode.label}<span>{mode.englishLabel}</span></button>)}
    </nav>

    <section className="time-panel" aria-label="天文时间控制">
      <button className="play-button" onClick={() => setSimulation((current) => ({ ...current, paused: !current.paused }))}>{simulation.paused ? '▶' : 'Ⅱ'}</button>
      <input aria-label="模拟日期" type="date" min="1900-01-01" max="2100-12-31" value={formatDateInput(simulation.utcMs)} onChange={(event) => setDate(event.target.value)} />
      <select aria-label="播放速度" value={simulation.rate} onChange={(event) => setSimulation((current) => ({ ...current, rate: Number(event.target.value) }))}>{PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{RATE_LABELS.get(rate)}</option>)}</select>
      <button onClick={resetNow}>回到现在</button>
    </section>

    <form className="object-search" onSubmit={submitSearch}><input aria-label="搜索天体" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索行星或 Gaia source ID" /><button type="submit">定位</button></form>

    {simulation.mode === 'earth' && <section className="control-panel" aria-label="Scene controls">
      <div className="preset-panel" aria-label="Camera presets">{CAMERA_PRESETS.map((item) => <button className={preset === item.id ? 'active' : ''} key={item.id} onClick={() => setPreset(item.id)}>{item.label}</button>)}</div>
      <button onClick={() => setAnnotations(!annotations)}>{annotations ? '隐藏解说' : '显示解说'}</button>
      <button className={forecastClouds ? 'active' : ''} onClick={() => setForecastClouds(!forecastClouds)}>{forecastClouds ? '预报云层：开' : '预报云层'}</button>
      <button onClick={() => xrStore.enterVR()}>进入 VR</button>
    </section>}

    {simulation.mode === 'solar' && <section className="scale-tools"><button className={trueScale ? 'active' : ''} onClick={() => setTrueScale(!trueScale)}>{trueScale ? '真实直径：开' : '可视尺寸：开'}</button><button className={showSmallBodies ? 'active' : ''} onClick={() => setShowSmallBodies(!showSmallBodies)}>{showSmallBodies ? '小天体：开' : '小天体：关'}</button><span>位置与轨道按真实 AU 比例</span></section>}

    {(selectedBody || stellarSelection) && <aside className="object-details">
      {selectedBody && <><small>SELECTED OBJECT</small><h2>{selectedBody.label}</h2><p>{selectedBody.englishLabel}</p><dl><div><dt>日心距离</dt><dd>{selectedDistance?.toFixed(3)} AU</dd></div><div><dt>平均半径</dt><dd>{selectedBody.radiusKm.toLocaleString()} km</dd></div><div><dt>数据</dt><dd>Astronomy Engine / JPL 验证</dd></div></dl></>}
      {stellarSelection && <><small>GAIA DR3 SOURCE</small><h2>{stellarSelection.label}</h2><dl><div><dt>太阳距离</dt><dd>{stellarSelection.distancePc.toFixed(2)} pc</dd></div><div><dt>径向速度</dt><dd>{stellarSelection.radialVelocityKnown ? '可用' : '缺失 · 仅切向运动'}</dd></div><div><dt>历元</dt><dd>Gaia 2016.0</dd></div></dl></>}
    </aside>}

    <footer>
      <span>{simulation.mode === 'earth' ? '地球中心局部尺度' : simulation.mode === 'solar' ? '日心黄道 J2000 · AU' : 'ICRS / Gaia 2016.0 · pc'}</span>
      <span>{new Date(simulation.utcMs).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
      <span>{simulation.mode === 'earth' ? cloudStatus : simulation.mode === 'stellar' ? stellarStatus : '太阳 + 八大行星 + 月球'}</span>
      <span>{frameP95 == null ? '正在采样帧时间…' : `p95 ${frameP95.toFixed(1)} ms · ${Math.round(1_000 / frameP95)} fps · DPR ${dprCap.toFixed(2)}`}</span>
      {simulation.mode === 'earth' && <span>{skyReady ? `HYG 天空背景 · ${quality === 'desktop' ? '1,250' : '850'} 颗亮星` : '正在加载 HYG 天空背景…'}</span>}
    </footer>
  </main>
}
