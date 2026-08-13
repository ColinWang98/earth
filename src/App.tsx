import { useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { CAMERA_PRESETS, type CameraPresetId, Scene } from './Scene'

const xrStore = createXRStore({
  controller: { rayPointer: true, teleportPointer: false },
})

export function App() {
  const [annotations, setAnnotations] = useState(false)
  const [skyReady, setSkyReady] = useState(false)
  const [forecastClouds, setForecastClouds] = useState(false)
  const [cloudStatus, setCloudStatus] = useState('静态卫星云层')
  const [preset, setPreset] = useState<CameraPresetId>('orbit')
  const [quality] = useState(() => /OculusBrowser|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' as const : 'desktop' as const)
  const handleSkyReady = useCallback(() => setSkyReady(true), [])

  return (
    <main className="experience">
      <Canvas
        camera={{ position: [0, 1.25, 9], fov: 48, near: 0.05, far: 400 }}
        dpr={quality === 'mobile' ? [1, 1.2] : [1, 1.65]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <XR store={xrStore}>
          <Scene annotations={annotations} forecastClouds={forecastClouds} preset={preset} quality={quality} onPresetChange={setPreset} onSkyReady={handleSkyReady} onCloudStatus={setCloudStatus} />
        </XR>
      </Canvas>

      <header className="title-block">
        <p>EARTH OBSERVATION</p>
        <h1>日地月观察</h1>
        <span>Earth · Moon · Sun</span>
      </header>

      <section className="control-panel" aria-label="Scene controls">
        <div className="preset-panel" aria-label="Camera presets">
          {CAMERA_PRESETS.map((item) => <button className={preset === item.id ? 'active' : ''} key={item.id} onClick={() => setPreset(item.id)}>{item.label}</button>)}
        </div>
        <button onClick={() => setAnnotations(!annotations)}>
          {annotations ? '隐藏解说' : '显示解说'}
        </button>
        <button className={forecastClouds ? 'active' : ''} onClick={() => setForecastClouds(!forecastClouds)}>
          {forecastClouds ? '预报云层：开' : '预报云层'}
        </button>
        <button onClick={() => xrStore.enterVR()}>进入 VR</button>
      </section>

      <footer>
        <span>自由太空观察 · 地球中心轨道</span>
        <span>桌面：拖拽环绕 · 滚轮缩放</span>
        <span>Quest 3：左摇杆环绕 · 右摇杆拉近/拉远</span>
        <span>{cloudStatus}</span>
        <span>{skyReady ? `真实星表已就绪 · ${quality === 'desktop' ? '1,250' : '850'} 颗亮星` : '正在加载真实星表…'}</span>
      </footer>
    </main>
  )
}
