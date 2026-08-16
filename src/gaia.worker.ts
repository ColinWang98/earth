/// <reference lib="webworker" />
import { decodeGaiaCatalog } from './starCatalog'

type GaiaManifest = { files: Array<{ id: string; url: string }> }

self.onmessage = async (event: MessageEvent<{ quality: 'desktop' | 'mobile' }>) => {
  try {
    const manifestUrl = `${import.meta.env.BASE_URL}assets/stars/gaia/manifest.json`
    const manifestResponse = await fetch(manifestUrl)
    if (!manifestResponse.ok) throw new Error(`Gaia manifest ${manifestResponse.status}`)
    const manifest = await manifestResponse.json() as GaiaManifest
    for (const file of manifest.files) {
      if (event.data.quality === 'mobile' && file.id === 'far') continue
      const response = await fetch(`${import.meta.env.BASE_URL}assets/stars/gaia/${file.id}.bin`)
      if (!response.ok) throw new Error(`Gaia ${file.id} ${response.status}`)
      const catalog = decodeGaiaCatalog(await response.arrayBuffer())
      self.postMessage({ type: 'shell', id: file.id, catalog }, {
        transfer: [catalog.positions.buffer, catalog.velocities.buffer, catalog.colors.buffer, catalog.magnitudes.buffer, catalog.qualityFlags.buffer, catalog.nameIndices.buffer],
      })
    }
    self.postMessage({ type: 'ready' })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Gaia catalogue unavailable' })
  }
}

export {}
