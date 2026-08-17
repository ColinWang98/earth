import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
import { CAMERA_PRESETS, Scene, VRPresetMenu, type CameraPresetId, type EarthObservationStatus } from './Scene'
import { advanceSimulationTime, getSolarSystemSnapshot, MAX_SIMULATION_TIME, MIN_SIMULATION_TIME } from './astro'
import { formatDateInput, parseDateInput, PLAYBACK_RATES, type SimulationState } from './simulation'
import { distanceAu, effectiveObserverPosition, nearestBody, type NavigationState } from './navigation'
import { getSmallBodyStates, SMALL_BODIES } from './smallBodies'
import { percentile95 } from './performance'
import { createEarthImageryRequest, type EarthImageryRequest } from './earthImagery'

const AU_KM = 149_597_870.7
const xrStore = createXRStore({ enterGrantedSession: false, controller: { rayPointer: true, teleportPointer: false } })
const RATE_LABELS = new Map<number, string>([
  [-86_400, '−1 天/秒'], [-3_600, '−1 小时/秒'], [1, '实时 1×'], [3_600, '1 小时/秒'], [86_400, '1 天/秒'], [2_592_000, '30 天/秒'],
])

function nearEarthNavigation(utcMs: number): NavigationState {
  const earth = getSolarSystemSnapshot(utcMs).find((body) => body.id === 'earth')!
  const standoffAu = earth.radiusKm / AU_KM * 4.6
  return {
    controlMode: 'orbit',
    observerHelioAu: [earth.positionAu[0], earth.positionAu[1] - standoffAu, earth.positionAu[2]],
    orientation: [0, 0, 0, 1],
    speedAuPerSecond: 0.000001,
    band: 'surface',
  }
}

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
  const [preset, setPreset] = useState<CameraPresetId>('orbit')
  const [showSmallBodies, setShowSmallBodies] = useState(true)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [imageryRequest, setImageryRequest] = useState<EarthImageryRequest>()
  const [observation, setObservation] = useState<EarthObservationStatus>({ source: 'NASA GIBS · VIIRS/Suomi NPP · 预存', label: '2026-08-15 预存 NASA VIIRS 真彩 · 4K', date: '2026-08-15', fallback: true, loading: false, resolution: '4K' })
  const [simulation, setSimulation] = useState<SimulationState>(() => ({ utcMs: Date.now(), paused: false, rate: 1, selectedObjectId: 'earth' }))
  const [navigation, setNavigation] = useState<NavigationState>(() => nearEarthNavigation(Date.now()))
  const [quality] = useState(() => /OculusBrowser|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' as const : 'desktop' as const)
  const [dprCap, setDprCap] = useState(() => quality === 'mobile' ? 1.15 : 1.65)
  const handleSkyReady = useCallback(() => setSkyReady(true), [])

  useEffect(() => {
    if (simulation.paused) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) / 1_000
      previous = now
      setSimulation((current) => ({ ...current, utcMs: advanceSimulationTime(current.utcMs, delta, current.rate) }))
    }, 100)
    return () => window.clearInterval(timer)
  }, [simulation.paused, simulation.rate])

  const snapshot = useMemo(() => getSolarSystemSnapshot(simulation.utcMs), [simulation.utcMs])
  const smallBodyStates = useMemo(() => getSmallBodyStates(simulation.utcMs), [simulation.utcMs])
  const allBodies = useMemo(() => [...snapshot, ...smallBodyStates], [snapshot, smallBodyStates])
  const selectedBody = allBodies.find((body) => body.id === simulation.selectedObjectId)
  const earth = snapshot.find((body) => body.id === 'earth')!
  const observerPosition = effectiveObserverPosition(navigation, earth.positionAu, earth.radiusKm / AU_KM * 4.6)
  const nearest = nearestBody(observerPosition, snapshot)
  const selectedDistance = selectedBody ? distanceAu(observerPosition, selectedBody.positionAu) : null

  const setDate = (value: string) => {
    const parsed = parseDateInput(value)
    if (parsed != null) setSimulation((current) => ({ ...current, utcMs: parsed }))
  }
  const resetNow = () => setSimulation((current) => ({ ...current, utcMs: Math.min(MAX_SIMULATION_TIME, Math.max(MIN_SIMULATION_TIME, Date.now())), paused: false, rate: 1 }))
  const refreshEarthImagery = () => setImageryRequest((current) => createEarthImageryRequest(current, Date.now()))
  const setControlMode = (controlMode: NavigationState['controlMode']) => {
    if (controlMode === 'flight') {
      const next = nearEarthNavigation(simulation.utcMs)
      setNavigation({ ...next, controlMode: 'flight' })
    } else {
      setNavigation((current) => ({ ...current, controlMode: 'orbit' }))
      setSimulation((current) => ({ ...current, selectedObjectId: 'earth' }))
    }
  }
  const selectBody = useCallback((id: string) => {
    setSimulation((current) => ({ ...current, selectedObjectId: id }))
  }, [])
  const cyclePreset = () => setPreset((current) => {
    const index = CAMERA_PRESETS.findIndex((item) => item.id === current)
    return CAMERA_PRESETS[(index + 1) % CAMERA_PRESETS.length].id
  })

  const flightAvailable = !('ontouchstart' in window) || /OculusBrowser/i.test(navigator.userAgent)
  const distanceLabel = nearest.distanceAu < 0.01 ? `${Math.round(nearest.distanceAu * AU_KM).toLocaleString()} km` : `${nearest.distanceAu.toFixed(3)} AU`
  const selectedDistanceLabel = selectedDistance == null ? '' : selectedDistance < 0.01 ? `${Math.round(selectedDistance * AU_KM).toLocaleString()} km` : `${selectedDistance.toFixed(3)} AU`
  const selectedSmallBody = SMALL_BODIES.find((body) => body.id === selectedBody?.id)
  const selectedIsSmallBody = selectedSmallBody != null
  const selectedCoordinates = selectedBody?.positionAu.map((value) => value.toFixed(7)).join(' / ')
  const dataTimestamp = new Date(simulation.utcMs).toISOString().replace('T', ' ').slice(0, 19)

  return <main className={`experience band-${navigation.band} control-${navigation.controlMode}`}>
    <Canvas camera={{ position: [0, 1.25, 9], fov: 48, near: 0.001, far: 500 }} dpr={[quality === 'mobile' ? 0.8 : 1, dprCap]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <PerformanceMonitor flipflops={3} onDecline={() => setDprCap((current) => Math.max(quality === 'mobile' ? 0.9 : 1, current - 0.15))} onIncline={() => setDprCap((current) => Math.min(quality === 'mobile' ? 1.15 : 1.65, current + 0.08))}>
        <FrameProbe onSample={setFrameP95} />
        <XR store={xrStore}><Suspense fallback={null}>
          <XROrigin position={[0, -1.6, 8]}><VRPresetMenu controlMode={navigation.controlMode} onControlModeChange={setControlMode} onPresetChange={setPreset} /></XROrigin>
          <Scene
            annotations={annotations}
            navigation={navigation}
            preset={preset}
            quality={quality}
            selectedObjectId={simulation.selectedObjectId}
            imageryRequest={imageryRequest}
            showSmallBodies={showSmallBodies}
            frameP95Ms={frameP95}
            paused={simulation.paused}
            rate={simulation.rate}
            utcMs={simulation.utcMs}
            onNavigationChange={setNavigation}
            onObservationStatus={setObservation}
            onSelect={selectBody}
            onSkyReady={handleSkyReady}
          />
        </Suspense></XR>
      </PerformanceMonitor>
    </Canvas>

    <header className="title-block"><p>LIVE EARTH · SOLAR SYSTEM</p><h1>地球与太阳系观察</h1><span>NASA imagery · Astronomy Engine · JPL validated</span></header>

    <section className="time-panel" aria-label="天文时间控制">
      <button className="play-button" onClick={() => setSimulation((current) => ({ ...current, paused: !current.paused }))}>{simulation.paused ? '▶' : 'Ⅱ'}</button>
      <input aria-label="模拟日期" type="date" min="1900-01-01" max="2100-12-31" value={formatDateInput(simulation.utcMs)} onChange={(event) => setDate(event.target.value)} />
      <select aria-label="播放速度" value={simulation.rate} onChange={(event) => setSimulation((current) => ({ ...current, rate: Number(event.target.value) }))}>{PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{RATE_LABELS.get(rate)}</option>)}</select>
      <button onClick={resetNow}>回到现在</button>
      <button disabled={observation.loading} onClick={refreshEarthImagery}>{observation.loading ? '正在更新…' : '更新卫星影像'}</button>
    </section>

    <section className="control-panel" aria-label="场景控制">
      {navigation.controlMode === 'orbit' && <div className="preset-panel" aria-label="观察机位">{CAMERA_PRESETS.map((item) => <button className={preset === item.id ? 'active' : ''} key={item.id} onClick={() => setPreset(item.id)}>{item.label}</button>)}</div>}
      {flightAvailable && <button className={navigation.controlMode === 'flight' ? 'active' : ''} onClick={() => setControlMode(navigation.controlMode === 'flight' ? 'orbit' : 'flight')}>{navigation.controlMode === 'flight' ? '退出自由飞行' : '自由飞行'}</button>}
      <button onClick={() => setAnnotations((current) => !current)}>{annotations ? '隐藏标签' : '显示标签'}</button>
      <button className={showSmallBodies ? 'active' : ''} onClick={() => setShowSmallBodies((current) => !current)}>{showSmallBodies ? '小天体：开' : '小天体：关'}</button>
      <button onClick={() => xrStore.enterVR()}>进入 VR</button>
    </section>

    <section className="mobile-toolbar" aria-label="手机场景控制">
      <button onClick={cyclePreset}>{CAMERA_PRESETS.find((item) => item.id === preset)?.label ?? '切换机位'}</button>
      <button className={annotations ? 'active' : ''} onClick={() => setAnnotations((current) => !current)}>标签</button>
      <button className={showSmallBodies ? 'active' : ''} onClick={() => setShowSmallBodies((current) => !current)}>小天体</button>
      <button className={mobileDetailsOpen ? 'active' : ''} aria-expanded={mobileDetailsOpen} onClick={() => setMobileDetailsOpen((current) => !current)}>详情</button>
    </section>

    {navigation.controlMode === 'flight' && <section className="flight-help"><strong>自由飞行</strong><span>WASD 移动 · Q/E 升降 · Shift 加速 · 滚轮调速 · Esc 释放鼠标</span></section>}

    {selectedBody && <aside className={`object-details ${mobileDetailsOpen ? 'mobile-open' : ''}`}><button className="mobile-details-close" aria-label="关闭详情" onClick={() => setMobileDetailsOpen(false)}>×</button><small>SELECTED OBJECT</small><h2>{selectedBody.label}</h2><p>{selectedBody.englishLabel}</p><dl><div><dt>观察距离</dt><dd>{selectedDistanceLabel}</dd></div><div><dt>{selectedIsSmallBody ? '显示方式' : '平均半径'}</dt><dd>{selectedIsSmallBody ? '视觉放大标记' : `${selectedBody.radiusKm.toLocaleString()} km`}</dd></div>{selectedSmallBody && <><div><dt>自转周期</dt><dd>{selectedSmallBody.rotationPeriodHours.toFixed(2)} h · {selectedSmallBody.rotationSource === 'jpl' ? 'JPL' : '近似值'}</dd></div><div><dt>自转轴</dt><dd>{selectedSmallBody.axisSource === 'jpl' ? 'JPL 精确极轴' : '示意轴（非精确观测）'}</dd></div><div><dt>形状数据</dt><dd>{selectedSmallBody.shapeModel ? 'NASA VTAD 真实形状' : '确定性程序岩石'}</dd></div></>}<div><dt>日心坐标 (AU)</dt><dd>{selectedCoordinates}</dd></div><div><dt>数据时刻</dt><dd>{dataTimestamp} UTC</dd></div><div><dt>位置数据</dt><dd>{selectedIsSmallBody ? 'NASA/JPL SBDB' : 'Astronomy Engine / JPL'}</dd></div></dl></aside>}

    <footer>
      <span>{navigation.band === 'surface' ? '近地表尺度' : navigation.band === 'orbital' ? '行星轨道尺度' : '太阳系尺度 · 远景尺寸已放大'}</span>
      <span>{new Date(simulation.utcMs).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
      <span>{observation.label}</span>
      <span>NASA/GSFC/ESDIS · {observation.source}</span>
      <span>最近：{nearest.label} · {distanceLabel} · {navigation.speedAuPerSecond < 0.001 ? `${Math.round(navigation.speedAuPerSecond * AU_KM).toLocaleString()} km/s` : `${navigation.speedAuPerSecond.toFixed(3)} AU/s`}</span>
      <span>{frameP95 == null ? '正在采样帧时间…' : `p95 ${frameP95.toFixed(1)} ms · ${Math.round(1_000 / frameP95)} fps · DPR ${dprCap.toFixed(2)}`}</span>
      <span>{skyReady ? `HYG 星空 · ${quality === 'desktop' ? '1,250' : '850'} 颗亮星` : '正在加载 HYG 星空…'}</span>
      {showSmallBodies && navigation.controlMode === 'orbit' && <span>七颗重点小天体 · 滚轮拉远至太阳系尺度显示</span>}
    </footer>
  </main>
}
