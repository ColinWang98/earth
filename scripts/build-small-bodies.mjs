import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseSmallBody } from './small-body-lib.mjs'

const targets = [
  ['1', '谷神星'], ['4', '灶神星'], ['433', '爱神星'], ['101955', '贝努'], ['99942', '阿波菲斯'], ['1P', '哈雷彗星'], ['2P', '恩克彗星'],
]
const bodies = []
for (const [designation, label] of targets) {
  const url = new URL('https://ssd-api.jpl.nasa.gov/sbdb.api')
  url.searchParams.set('sstr', designation)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`JPL SBDB ${designation}: ${response.status}`)
  bodies.push(parseSmallBody(await response.json(), label))
}

const outputDir = resolve(import.meta.dirname, '../public/assets/solar')
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'small-bodies.json'), `${JSON.stringify({ source: 'NASA/JPL SBDB', generatedAt: new Date().toISOString(), bodies }, null, 2)}\n`)
console.log(`JPL SBDB snapshot: ${bodies.map((body) => body.englishLabel).join(', ')}`)
