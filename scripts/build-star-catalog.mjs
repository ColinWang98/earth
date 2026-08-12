import { readFile, writeFile } from 'node:fs/promises'

const [input, output] = process.argv.slice(2)
const THREE_DEG = Math.PI / 180

if (!input || !output) throw new Error('Usage: node scripts/build-star-catalog.mjs <hyg.csv> <stars.bin>')

const text = await readFile(input, 'utf8')
const [header, ...rows] = text.trim().split('\n')
const parseCsvLine = (line) => {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += char; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(value)
      value = ''
    } else value += char
  }
  values.push(value)
  return values
}

const columns = parseCsvLine(header)
const field = Object.fromEntries(columns.map((name, index) => [name, index]))

const stars = rows
  .map(parseCsvLine)
  .map((row) => ({
    ra: Number(row[field.ra]),
    dec: Number(row[field.dec]),
    mag: Number(row[field.mag]),
    ci: Number(row[field.ci]),
  }))
  .filter((star) => Number.isFinite(star.ra) && Number.isFinite(star.dec) && Number.isFinite(star.mag) && star.mag > -10)
  .sort((a, b) => a.mag - b.mag)
  .slice(1, 2001)

const data = new Float32Array(stars.length * 5)
for (const [index, star] of stars.entries()) {
  const ra = THREE_DEG * star.ra * 15
  const dec = THREE_DEG * star.dec
  const cosDec = Math.cos(dec)
  data[index * 5] = cosDec * Math.cos(ra)
  data[index * 5 + 1] = Math.sin(dec)
  data[index * 5 + 2] = cosDec * Math.sin(ra)
  data[index * 5 + 3] = Number.isFinite(star.ci) ? star.ci : 0.65
  data[index * 5 + 4] = star.mag
}

await writeFile(output, Buffer.from(data.buffer))
console.log(`Wrote ${stars.length} HYG stars (${data.byteLength} bytes)`) 
