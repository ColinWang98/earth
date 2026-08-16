import { describe, expect, it } from 'vitest'
import { buildGibsWmsUrl, chooseEarthImagery, estimateImageCoverage, getRecentProbeDates } from './earthImagery'

describe('NASA GIBS earth imagery', () => {
  const now = Date.UTC(2026, 7, 16, 8)

  it('probes today and the three preceding UTC dates for a current observation', () => {
    expect(getRecentProbeDates(now)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13'])
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
})
