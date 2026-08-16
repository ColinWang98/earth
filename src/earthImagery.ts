const VIIRS_START = Date.UTC(2012, 0, 19)
const MODIS_START = Date.UTC(2000, 1, 24)
const DAY_MS = 86_400_000

export const VIIRS_LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor'
export const MODIS_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor'

export type EarthImageryChoice =
  | { kind: 'recent'; dates: string[]; layer: typeof VIIRS_LAYER }
  | { kind: 'dated'; date: string; layer: typeof VIIRS_LAYER | typeof MODIS_LAYER }
  | { kind: 'fallback'; reason: 'outside-satellite-era' | 'future-date' }

function utcDate(utcMs: number) {
  return new Date(utcMs).toISOString().slice(0, 10)
}

export function getRecentProbeDates(nowMs: number) {
  const start = Date.parse(`${utcDate(nowMs)}T00:00:00.000Z`)
  return Array.from({ length: 4 }, (_, index) => utcDate(start - index * DAY_MS))
}

export function chooseEarthImagery(utcMs: number, nowMs = Date.now()): EarthImageryChoice {
  const selectedDate = utcDate(utcMs)
  const today = utcDate(nowMs)
  if (utcMs > nowMs && selectedDate !== today) return { kind: 'fallback', reason: 'future-date' }
  if (selectedDate === today) return { kind: 'recent', dates: getRecentProbeDates(nowMs), layer: VIIRS_LAYER }
  if (utcMs >= VIIRS_START) return { kind: 'dated', date: selectedDate, layer: VIIRS_LAYER }
  if (utcMs >= MODIS_START) return { kind: 'dated', date: selectedDate, layer: MODIS_LAYER }
  return { kind: 'fallback', reason: 'outside-satellite-era' }
}

export function buildGibsWmsUrl(layer: string, date: string, width: number, height: number) {
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326', BBOX: '-180,-90,180,90',
    WIDTH: String(width), HEIGHT: String(height), TIME: date,
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`
}

export function estimateImageCoverage(pixels: Uint8ClampedArray) {
  if (pixels.length < 4) return 0
  let useful = 0
  const count = Math.floor(pixels.length / 4)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 8 && pixels[offset + 3] > 0) useful += 1
  }
  return useful / count
}
