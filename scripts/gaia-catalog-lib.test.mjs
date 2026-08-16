import { describe, expect, it } from 'vitest'
import { encodeCatalog, findLandmarkMatches, parseCsv, parseGaiaRecord, selectLod } from './gaia-catalog-lib.mjs'

describe('Gaia catalogue conversion', () => {
  it('converts astrometry into Cartesian parsec position and velocity', () => {
    const record = parseGaiaRecord({
      source_id: '5853498713190525696',
      ra: '0',
      dec: '0',
      parallax: '1000',
      pmra: '1000',
      pmdec: '0',
      radial_velocity: '',
      phot_g_mean_mag: '1',
      bp_rp: '0.65',
    })

    expect(record.positionPc[0]).toBeCloseTo(1, 8)
    expect(record.positionPc[1]).toBeCloseTo(0, 8)
    expect(record.positionPc[2]).toBeCloseTo(0, 8)
    expect(record.velocityPcPerYear[1]).toBeCloseTo(4.8481368e-6, 12)
    expect(record.absoluteMagnitude).toBeCloseTo(6, 8)
    expect(record.qualityFlags & 1).toBe(1)
  })

  it('writes a deterministic 48-byte record binary', () => {
    const record = parseGaiaRecord({
      source_id: '1', ra: '90', dec: '0', parallax: '100', pmra: '0', pmdec: '0',
      radial_velocity: '0', phot_g_mean_mag: '5', bp_rp: '1',
    })
    const first = encodeCatalog([record])
    const second = encodeCatalog([record])

    expect(first.byteLength).toBe(64)
    expect(new Uint8Array(first)).toEqual(new Uint8Array(second))
  })
})

describe('Gaia LOD selection', () => {
  it('keeps all stars within 25 pc and caps outer shells by brightness', () => {
    const rows = [
      { distancePc: 10, absoluteMagnitude: 10 },
      { distancePc: 24, absoluteMagnitude: 12 },
      { distancePc: 30, absoluteMagnitude: 6 },
      { distancePc: 40, absoluteMagnitude: 2 },
      { distancePc: 80, absoluteMagnitude: 1 },
      { distancePc: 90, absoluteMagnitude: 8 },
    ]
    const selected = selectLod(rows, { midLimit: 1, farLimit: 1 })

    expect(selected.near).toHaveLength(2)
    expect(selected.mid).toEqual([rows[3]])
    expect(selected.far).toEqual([rows[4]])
  })

  it('parses the Gaia CSV header and empty radial velocity', () => {
    const rows = parseCsv('source_id,ra,dec,radial_velocity\n42,1,2,\n')
    expect(rows).toEqual([{ source_id: '42', ra: '1', dec: '2', radial_velocity: '' }])
  })
})

describe('named nearby stars', () => {
  it('matches a landmark to the closest catalogue direction', () => {
    const records = [
      { sourceIdHi: 0, sourceIdLo: 7, positionPc: [1, 0, 0], distancePc: 1, qualityFlags: 0 },
      { sourceIdHi: 0, sourceIdLo: 8, positionPc: [0, 1, 0], distancePc: 1, qualityFlags: 1 },
    ]
    const matches = findLandmarkMatches(records, [{ id: 'test', label: '测试星', englishLabel: 'Test Star', ra: 0, dec: 0 }])

    expect(matches).toEqual([{ id: 'test', label: '测试星', englishLabel: 'Test Star', sourceId: '7', distancePc: 1, radialVelocityKnown: true }])
  })
})
