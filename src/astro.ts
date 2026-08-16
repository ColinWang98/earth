import { Body, Equator, GeoMoon, HelioVector, Observer, RotateVector, Rotation_EQJ_ECL, SiderealTime } from 'astronomy-engine'

export const MIN_SIMULATION_TIME = Date.UTC(1900, 0, 1)
export const MAX_SIMULATION_TIME = Date.UTC(2100, 11, 31, 23, 59, 59, 999)

export type CelestialBodyId = 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export interface CelestialBodyState {
  id: CelestialBodyId
  label: string
  englishLabel: string
  color: string
  radiusKm: number
  positionAu: [number, number, number]
}

const BODY_DEFINITIONS: ReadonlyArray<Omit<CelestialBodyState, 'positionAu'> & { astronomyBody?: Body }> = [
  { id: 'sun', label: '太阳', englishLabel: 'Sun', color: '#ffd36a', radiusKm: 696_340 },
  { id: 'mercury', label: '水星', englishLabel: 'Mercury', color: '#a9a59f', radiusKm: 2_439.7, astronomyBody: Body.Mercury },
  { id: 'venus', label: '金星', englishLabel: 'Venus', color: '#e9c78b', radiusKm: 6_051.8, astronomyBody: Body.Venus },
  { id: 'earth', label: '地球', englishLabel: 'Earth', color: '#4b90d9', radiusKm: 6_371, astronomyBody: Body.Earth },
  { id: 'moon', label: '月球', englishLabel: 'Moon', color: '#d9d6ca', radiusKm: 1_737.4 },
  { id: 'mars', label: '火星', englishLabel: 'Mars', color: '#c65f3d', radiusKm: 3_389.5, astronomyBody: Body.Mars },
  { id: 'jupiter', label: '木星', englishLabel: 'Jupiter', color: '#d6b18c', radiusKm: 69_911, astronomyBody: Body.Jupiter },
  { id: 'saturn', label: '土星', englishLabel: 'Saturn', color: '#e3cf9b', radiusKm: 58_232, astronomyBody: Body.Saturn },
  { id: 'uranus', label: '天王星', englishLabel: 'Uranus', color: '#9dd7dc', radiusKm: 25_362, astronomyBody: Body.Uranus },
  { id: 'neptune', label: '海王星', englishLabel: 'Neptune', color: '#4777d9', radiusKm: 24_622, astronomyBody: Body.Neptune },
]

const ORBIT_PERIOD_DAYS: Record<Exclude<CelestialBodyId, 'sun' | 'moon'>, number> = {
  mercury: 87.969, venus: 224.701, earth: 365.256, mars: 686.98,
  jupiter: 4_332.59, saturn: 10_759.22, uranus: 30_688.5, neptune: 60_182,
}

export function clampSimulationTime(utcMs: number) {
  return Math.min(MAX_SIMULATION_TIME, Math.max(MIN_SIMULATION_TIME, utcMs))
}

export function advanceSimulationTime(utcMs: number, realDeltaSeconds: number, rate: number) {
  return clampSimulationTime(utcMs + realDeltaSeconds * rate * 1_000)
}

function eclipticPosition(body: Body, date: Date): [number, number, number] {
  const vector = RotateVector(Rotation_EQJ_ECL(), HelioVector(body, date))
  return [vector.x, vector.y, vector.z]
}

export function getSolarSystemSnapshot(utcMs: number): CelestialBodyState[] {
  const date = new Date(clampSimulationTime(utcMs))
  const earthPosition = eclipticPosition(Body.Earth, date)
  const moonRelative = RotateVector(Rotation_EQJ_ECL(), GeoMoon(date))

  return BODY_DEFINITIONS.map(({ astronomyBody, ...body }) => {
    let positionAu: [number, number, number]
    if (body.id === 'sun') positionAu = [0, 0, 0]
    else if (body.id === 'moon') positionAu = [earthPosition[0] + moonRelative.x, earthPosition[1] + moonRelative.y, earthPosition[2] + moonRelative.z]
    else positionAu = body.id === 'earth' ? [...earthPosition] : eclipticPosition(astronomyBody!, date)
    return { ...body, positionAu }
  })
}

export function getPlanetOrbitPath(id: Exclude<CelestialBodyId, 'sun' | 'moon'>, utcMs: number, samples: number): [number, number, number][] {
  const definition = BODY_DEFINITIONS.find((body) => body.id === id)
  if (!definition?.astronomyBody) throw new Error(`No orbit is available for ${id}`)
  const count = Math.max(8, Math.floor(samples))
  const periodMs = ORBIT_PERIOD_DAYS[id] * 86_400_000
  const startMs = utcMs - periodMs / 2
  return Array.from({ length: count }, (_, index) => eclipticPosition(definition.astronomyBody!, new Date(startMs + periodMs * index / count)))
}

export function getMoonOrbitPath(utcMs: number, samples: number): [number, number, number][] {
  const count = Math.max(16, Math.floor(samples))
  const periodMs = 27.321661 * 86_400_000
  const startMs = utcMs - periodMs / 2
  return Array.from({ length: count }, (_, index) => {
    const vector = RotateVector(Rotation_EQJ_ECL(), GeoMoon(new Date(startMs + periodMs * index / count)))
    return [vector.x, vector.y, vector.z]
  })
}

export function getEarthFixedSunDirection(utcMs: number): [number, number, number] {
  const date = new Date(clampSimulationTime(utcMs))
  const equatorial = Equator(Body.Sun, date, new Observer(0, 0, 0), true, true)
  const declination = equatorial.dec * Math.PI / 180
  const hourAngle = (SiderealTime(date) - equatorial.ra) * Math.PI / 12
  const cosDeclination = Math.cos(declination)
  return [
    cosDeclination * Math.cos(hourAngle),
    Math.sin(declination),
    cosDeclination * Math.sin(hourAngle),
  ]
}
