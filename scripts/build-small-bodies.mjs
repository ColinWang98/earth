import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseSmallBody } from './small-body-lib.mjs'

const targets = [
  { designation: '1', label: '谷神星', shapeModel: 'ceres' },
  { designation: '4', label: '灶神星', shapeModel: 'vesta' },
  { designation: '433', label: '爱神星', shapeModel: 'eros' },
  { designation: '101955', label: '贝努', shapeModel: 'bennu' },
  { designation: '99942', label: '阿波菲斯', fallbackPole: [250, -50], fallbackAxisRatios: [1, 0.72, 0.58] },
  { designation: '1P', label: '哈雷彗星', fallbackRotationHours: 52.8, fallbackPole: [210, -20], fallbackAxisRatios: [1, 0.55, 0.48] },
  { designation: '2P', label: '恩克彗星', fallbackPole: [160, 40], fallbackAxisRatios: [1, 0.62, 0.48] },
]
const bodies = []
for (const { designation, label, ...presentation } of targets) {
  const url = new URL('https://ssd-api.jpl.nasa.gov/sbdb.api')
  url.searchParams.set('sstr', designation)
  url.searchParams.set('phys-par', 'true')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`JPL SBDB ${designation}: ${response.status}`)
  bodies.push(parseSmallBody(await response.json(), label, presentation))
}

const outputDir = resolve(import.meta.dirname, '../src/data')
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'small-bodies.json'), `${JSON.stringify({ source: 'NASA/JPL SBDB', generatedAt: new Date().toISOString(), bodies }, null, 2)}\n`)
console.log(`JPL SBDB snapshot: ${bodies.map((body) => body.englishLabel).join(', ')}`)
