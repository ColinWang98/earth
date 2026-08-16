import catalogue from '../public/assets/solar/small-bodies.json'
import { propagateKeplerOrbit, type KeplerOrbit } from './orbits'

export type SmallBodyRecord = KeplerOrbit & { id: string; label: string; englishLabel: string }
export type SmallBodyState = SmallBodyRecord & { color: string; radiusKm: number; positionAu: [number, number, number] }

export const SMALL_BODIES = catalogue.bodies as SmallBodyRecord[]

export function getSmallBodyStates(utcMs: number): SmallBodyState[] {
  const julianDay = utcMs / 86_400_000 + 2_440_587.5
  return SMALL_BODIES.map((body) => ({ ...body, color: '#d77c43', radiusKm: 20, positionAu: propagateKeplerOrbit(body, julianDay) }))
}
