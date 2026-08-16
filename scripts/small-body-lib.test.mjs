import { describe, expect, it } from 'vitest'
import { parseSmallBody } from './small-body-lib.mjs'

describe('JPL SBDB conversion', () => {
  it('converts named orbital elements to the runtime schema', () => {
    const payload = {
      object: { spkid: '2000001', fullname: '1 Ceres' },
      orbit: { epoch: '2461000.5', elements: [
        { name: 'a', value: '2.77' }, { name: 'e', value: '0.08' }, { name: 'i', value: '10.6' },
        { name: 'om', value: '80.3' }, { name: 'w', value: '73.6' }, { name: 'ma', value: '12.5' },
      ] },
    }
    expect(parseSmallBody(payload, '谷神星')).toEqual({
      id: '2000001', label: '谷神星', englishLabel: '1 Ceres', epochJd: 2461000.5,
      semiMajorAu: 2.77, eccentricity: 0.08, inclinationDeg: 10.6,
      ascendingNodeDeg: 80.3, argumentOfPerihelionDeg: 73.6, meanAnomalyDeg: 12.5,
    })
  })
})
