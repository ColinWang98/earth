import { describe, expect, it } from 'vitest'
import { buildGibsWmsUrl, chooseEarthImagery, createEarthImageryRequest, disposeReplacedTextures, estimateImageCoverage, getEarthResolutionFallbacks, getImageryBlendFrames, getRecentProbeDates, selectEarthResolution } from './earthImagery'

describe('NASA GIBS earth imagery', () => {
  const now = Date.UTC(2026, 7, 16, 8)

  it('probes today and the three preceding UTC dates for a current observation', () => {
    expect(getRecentProbeDates(now)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13'])
  })

  it('snapshots the selected time only when the user requests new imagery', () => {
    const first = createEarthImageryRequest(undefined, Date.UTC(2026, 7, 16, 9))
    expect(first).toEqual({ id: 1, utcMs: Date.UTC(2026, 7, 16, 9) })
    expect(createEarthImageryRequest(first, Date.UTC(2025, 0, 2))).toEqual({ id: 2, utcMs: Date.UTC(2025, 0, 2) })
  })

  it('selects VIIRS, MODIS, or Blue Marble according to the requested date', () => {
    expect(chooseEarthImagery(Date.UTC(2026, 7, 16), now).kind).toBe('recent')
    expect(chooseEarthImagery(Date.UTC(2010, 5, 1), now)).toMatchObject({ kind: 'dated', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor' })
    expect(chooseEarthImagery(Date.UTC(1999, 11, 31), now).kind).toBe('fallback')
    expect(chooseEarthImagery(Date.UTC(2027, 0, 1), now).kind).toBe('fallback')
  })

  it('builds a browser-safe global WMS request', () => {
    const url = new URL(buildGibsWmsUrl('VIIRS_SNPP_CorrectedReflectance_TrueColor', '2026-08-14', 4096, 2048))
    expect(url.origin).toBe('https://gibs.earthdata.nasa.gov')
    expect(url.searchParams.get('BBOX')).toBe('-180,-90,180,90')
    expect(url.searchParams.get('WIDTH')).toBe('4096')
    expect(url.searchParams.get('TIME')).toBe('2026-08-14')
  })

  it('measures useful non-black satellite coverage', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      12, 18, 22, 255,
      90, 110, 130, 255,
      0, 0, 0, 255,
    ])
    expect(estimateImageCoverage(pixels)).toBe(0.5)
  })

  it('uses 8K only for capable close desktop views and degrades under frame pressure', () => {
    expect(selectEarthResolution({ quality: 'desktop', closeView: true, maxTextureSize: 16_384, deviceMemoryGb: 16, frameP95Ms: 10 })).toEqual({ width: 8192, height: 4096, label: '8K' })
    expect(selectEarthResolution({ quality: 'desktop', closeView: true, maxTextureSize: 8192, deviceMemoryGb: 8, frameP95Ms: 18 })).toEqual({ width: 4096, height: 2048, label: '4K' })
    expect(selectEarthResolution({ quality: 'mobile', closeView: true, maxTextureSize: 8192, deviceMemoryGb: 8, frameP95Ms: 8 })).toEqual({ width: 2048, height: 1024, label: '2K' })
  })

  it('retries an 8K observation at 4K before using the static fallback', () => {
    expect(getEarthResolutionFallbacks({ width: 8192, height: 4096, label: '8K' }).map((entry) => entry.label)).toEqual(['8K', '4K'])
    expect(getEarthResolutionFallbacks({ width: 4096, height: 2048, label: '4K' }).map((entry) => entry.label)).toEqual(['4K'])
  })

  it('releases every replaced GPU texture', () => {
    const disposed: string[] = []
    disposeReplacedTextures([{ dispose: () => disposed.push('primary') }, { dispose: () => disposed.push('secondary') }])
    expect(disposed).toEqual(['primary', 'secondary'])
  })

  it('blends historical daily observations without requesting a future frame', () => {
    const historical = getImageryBlendFrames(Date.UTC(2025, 0, 4, 6), now)
    expect(historical).toEqual({ primaryDate: '2025-01-04', secondaryDate: '2025-01-05', mix: 0.25 })
    const current = getImageryBlendFrames(Date.UTC(2026, 7, 16, 18), now)
    expect(current).toEqual({ primaryDate: '2026-08-16', mix: 0 })
  })
})
