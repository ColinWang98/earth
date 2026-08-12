import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { Scene } from './Scene'

const xrStore = createXRStore({
  controller: { rayPointer: true, teleportPointer: false },
})

export function App() {
  const [annotations, setAnnotations] = useState(true)

  return (
    <main className="experience">
      <Canvas
        camera={{ position: [0, 1.25, 9], fov: 48, near: 0.05, far: 400 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <XR store={xrStore}>
          <Scene annotations={annotations} />
        </XR>
      </Canvas>

      <header className="title-block">
        <p>EARTH OBSERVATION</p>
        <h1>日地月观察舱</h1>
        <span>Earth · Moon · Sun</span>
      </header>

      <section className="control-panel" aria-label="Scene controls">
        <button onClick={() => setAnnotations(!annotations)}>
          {annotations ? '隐藏解说' : '显示解说'}
        </button>
        <button onClick={() => xrStore.enterVR()}>进入 VR</button>
      </section>

      <footer>
        <span>自由太空观察 · 地球中心轨道</span>
        <span>桌面：拖拽环绕 · 滚轮缩放</span>
        <span>Quest 3：左摇杆环绕 · 右摇杆拉近/拉远</span>
      </footer>
    </main>
  )
}
