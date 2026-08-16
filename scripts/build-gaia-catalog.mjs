import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { encodeCatalog, findLandmarkMatches, parseCsv, parseGaiaRecord, selectLod } from './gaia-catalog-lib.mjs'

const root = resolve(import.meta.dirname, '..')
const outputDir = resolve(root, 'public/assets/stars/gaia')
const inputArg = process.argv.find((argument) => argument.startsWith('--input='))?.slice(8)
const fields = 'source_id,ra,dec,parallax,pmra,pmdec,radial_velocity,phot_g_mean_mag,bp_rp'
const quality = 'parallax_over_error >= 10 AND astrometric_params_solved = 31 AND phot_g_mean_mag IS NOT NULL'

async function queryGaia(query) {
  const response = await fetch('https://gea.esac.esa.int/tap-server/tap/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: query }),
  })
  if (!response.ok) throw new Error(`Gaia TAP returned ${response.status}`)
  const csv = await response.text()
  if (!csv.startsWith('source_id')) throw new Error(`Unexpected Gaia response: ${csv.slice(0, 160)}`)
  return parseCsv(csv)
}

async function loadRows() {
  if (inputArg) return parseCsv(await readFile(resolve(inputArg), 'utf8'))
  const nearQuery = `SELECT ${fields} FROM gaiadr3.gaia_source WHERE parallax >= 40 AND parallax_over_error >= 10 AND (astrometric_params_solved = 31 OR astrometric_params_solved = 95) AND phot_g_mean_mag IS NOT NULL`
  const outerQuery = `SELECT TOP 30000 ${fields} FROM gaiadr3.gaia_source WHERE parallax >= 10 AND parallax < 40 AND ${quality} ORDER BY phot_g_mean_mag ASC`
  const [near, outer] = await Promise.all([queryGaia(nearQuery), queryGaia(outerQuery)])
  return [...near, ...outer]
}

const rows = await loadRows()
const records = rows.map(parseGaiaRecord).filter((record) => record.distancePc <= 100)
const shells = selectLod(records)
const landmarks = findLandmarkMatches(records, [
  { id: 'proxima-centauri', label: '比邻星', englishLabel: 'Proxima Centauri · α Cen C', ra: 217.4292, dec: -62.6795 },
  { id: 'alpha-centauri', label: '南门二', englishLabel: 'Alpha Centauri', ra: 219.9021, dec: -60.8339 },
  { id: 'sirius', label: '天狼星', englishLabel: 'Sirius', ra: 101.2872, dec: -16.7161 },
  { id: 'barnards-star', label: '巴纳德星', englishLabel: "Barnard's Star", ra: 269.4540, dec: 4.6683 },
])
await mkdir(outputDir, { recursive: true })

const files = []
for (const [name, shell] of Object.entries(shells)) {
  const path = resolve(outputDir, `${name}.bin`)
  await writeFile(path, new Uint8Array(encodeCatalog(shell)))
  files.push({ id: name, url: `./assets/stars/gaia/${name}.bin`, count: shell.length, bytes: 16 + shell.length * 48 })
}

const manifest = {
  schemaVersion: 1,
  source: 'ESA Gaia DR3',
  epoch: 2016,
  generatedAt: new Date().toISOString(),
  totalSourceRows: rows.length,
  files,
}
await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(resolve(outputDir, 'landmarks.json'), `${JSON.stringify(landmarks, null, 2)}\n`)
console.log(`Gaia catalogue: ${files.map((file) => `${file.id}=${file.count}`).join(', ')}`)
console.log(`Gaia landmarks: ${landmarks.map((landmark) => landmark.englishLabel).join(', ')}`)
