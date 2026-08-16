import { getSolarSystemSnapshot, type CelestialBodyId } from '../src/astro.ts'
import { angularSeparationArcminutes, parseHorizonsVectors } from './horizons-validation-lib.mjs'

const TARGETS: Array<{ id: Exclude<CelestialBodyId, 'sun'>; command: string }> = [
  { id: 'mercury', command: '199' }, { id: 'venus', command: '299' }, { id: 'earth', command: '399' },
  { id: 'moon', command: '301' }, { id: 'mars', command: '499' }, { id: 'jupiter', command: '599' },
  { id: 'saturn', command: '699' }, { id: 'uranus', command: '799' }, { id: 'neptune', command: '899' },
]

const requestedDates = process.argv.filter((argument) => argument.startsWith('--date=')).map((argument) => argument.slice(7))
const dates = requestedDates.length ? requestedDates : ['1900-01-01', '2000-01-01', '2100-01-01']
const results: Array<{ date: string; body: string; angleArcmin: number; distanceErrorPercent: number }> = []

for (const date of dates) {
  const utcMs = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(utcMs)) throw new Error(`Invalid --date=${date}`)
  const stop = new Date(utcMs + 86_400_000).toISOString().slice(0, 10)
  const snapshot = getSolarSystemSnapshot(utcMs)
  for (const target of TARGETS) {
    const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api')
    const parameters = {
      format: 'json', COMMAND: `'${target.command}'`, EPHEM_TYPE: 'VECTORS', CENTER: `'500@10'`,
      START_TIME: `'${date}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: `'1 d'`, REF_PLANE: 'ECLIPTIC',
      OUT_UNITS: 'AU-D', VEC_TABLE: '1', CSV_FORMAT: 'YES',
    }
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Horizons ${target.id}: ${response.status}`)
    const payload = await response.json() as { result: string }
    const expected = parseHorizonsVectors(payload.result)[0]
    const actual = snapshot.find((body) => body.id === target.id)!.positionAu
    const angleArcmin = angularSeparationArcminutes(actual, expected)
    const distanceErrorPercent = Math.abs(Math.hypot(...actual) - Math.hypot(...expected)) / Math.hypot(...expected) * 100
    results.push({ date, body: target.id, angleArcmin, distanceErrorPercent })
  }
}

console.table(results.map((result) => ({ date: result.date, body: result.body, 'angle arcmin': result.angleArcmin.toFixed(4), 'distance error %': result.distanceErrorPercent.toFixed(4) })))
const failed = results.filter((result) => result.angleArcmin > 1 || result.distanceErrorPercent > 0.2)
if (failed.length) throw new Error(`${failed.length} Horizons comparisons exceeded tolerance`)
