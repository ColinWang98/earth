import { describe, expect, it } from 'vitest'
import { parseSmallBody } from './small-body-lib.mjs'

describe('JPL SBDB conversion', () => {
  it('converts named orbital elements to the runtime schema', () => {
    const payload = {
      object: { spkid: '2000001', fullname: '1 Ceres' },
      phys_par: [
        { name: 'rot_per', value: '9.074170' },
        { name: 'pole', value: '291.421/66.758' },
        { name: 'extent', value: '964.4 x 964.2 x 891.8' },
      ],
      orbit: { epoch: '2461000.5', elements: [
        { name: 'a', value: '2.77' }, { name: 'e', value: '0.08' }, { name: 'i', value: '10.6' },
        { name: 'om', value: '80.3' }, { name: 'w', value: '73.6' }, { name: 'ma', value: '12.5' },
      ] },
    }
    const result = parseSmallBody(payload, '谷神星', { shapeModel: 'ceres' })
    expect(result).toMatchObject({
      id: '2000001', label: '谷神星', englishLabel: '1 Ceres', epochJd: 2461000.5,
      semiMajorAu: 2.77, eccentricity: 0.08, inclinationDeg: 10.6,
      ascendingNodeDeg: 80.3, argumentOfPerihelionDeg: 73.6, meanAnomalyDeg: 12.5,
      rotationPeriodHours: 9.07417, rotationSource: 'jpl', poleRaDeg: 291.421,
      poleDecDeg: 66.758, axisSource: 'jpl',
      shapeModel: 'ceres',
    })
    expect(result.axisRatios[0]).toBeCloseTo(1, 8)
    expect(result.axisRatios[1]).toBeCloseTo(0.9997926, 7)
    expect(result.axisRatios[2]).toBeCloseTo(0.9247200, 7)
  })

  it('uses explicit illustrative presentation fallbacks when JPL physical fields are missing', () => {
    const payload = {
      object: { spkid: '1000036', fullname: '1P/Halley' },
      phys_par: [{ name: 'extent', value: '14.9x8.2' }],
      orbit: { epoch: '2439875.5', elements: [
        { name: 'a', value: '17.9' }, { name: 'e', value: '0.968' }, { name: 'i', value: '162' },
        { name: 'om', value: '59.1' }, { name: 'w', value: '112' }, { name: 'ma', value: '274' },
      ] },
    }
    const result = parseSmallBody(payload, '哈雷彗星', { fallbackRotationHours: 52.8, fallbackPole: [210, -20], fallbackAxisRatios: [1, 0.55, 0.48] })
    expect(result).toMatchObject({ rotationPeriodHours: 52.8, rotationSource: 'illustrative', poleRaDeg: 210, poleDecDeg: -20, axisSource: 'illustrative', axisRatios: [1, 0.5503355704697986, 0.5503355704697986] })
  })
})
