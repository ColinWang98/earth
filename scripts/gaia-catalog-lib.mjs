const MAS_TO_RADIANS = Math.PI / (180 * 3_600_000)
const KM_S_TO_PC_YEAR = (365.25 * 86_400) / 3.0856775814913673e13
const RECORD_STRIDE = 48
const HEADER_SIZE = 16
const MAGIC = 0x31494147

function finite(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parseGaiaRecord(row) {
  const sourceId = BigInt(row.source_id)
  const ra = finite(row.ra) * Math.PI / 180
  const dec = finite(row.dec) * Math.PI / 180
  const parallax = finite(row.parallax)
  if (parallax <= 0) throw new Error(`Invalid parallax for Gaia ${row.source_id}`)

  const distancePc = 1000 / parallax
  const cosDec = Math.cos(dec)
  const sinDec = Math.sin(dec)
  const cosRa = Math.cos(ra)
  const sinRa = Math.sin(ra)
  const radialKnown = row.radial_velocity !== '' && row.radial_velocity != null && Number.isFinite(Number(row.radial_velocity))
  const radialVelocity = radialKnown ? Number(row.radial_velocity) * KM_S_TO_PC_YEAR : 0
  const pmra = finite(row.pmra) * MAS_TO_RADIANS
  const pmdec = finite(row.pmdec) * MAS_TO_RADIANS
  const radial = [cosDec * cosRa, cosDec * sinRa, sinDec]
  const tangentRa = [-sinRa, cosRa, 0]
  const tangentDec = [-sinDec * cosRa, -sinDec * sinRa, cosDec]

  return {
    sourceIdHi: Number((sourceId >> 32n) & 0xffffffffn),
    sourceIdLo: Number(sourceId & 0xffffffffn),
    positionPc: radial.map((component) => component * distancePc),
    velocityPcPerYear: radial.map((component, index) => component * radialVelocity + distancePc * (tangentRa[index] * pmra + tangentDec[index] * pmdec)),
    absoluteMagnitude: finite(row.phot_g_mean_mag) + 5 * Math.log10(parallax) - 10,
    colorIndex: finite(row.bp_rp, 0.8),
    qualityFlags: radialKnown ? 0 : 1,
    nameIndex: 0xffffffff,
    distancePc,
  }
}

export function encodeCatalog(records) {
  const buffer = new ArrayBuffer(HEADER_SIZE + records.length * RECORD_STRIDE)
  const view = new DataView(buffer)
  view.setUint32(0, MAGIC, true)
  view.setUint16(4, 1, true)
  view.setUint16(6, RECORD_STRIDE, true)
  view.setUint32(8, records.length, true)
  view.setUint32(12, 0, true)

  records.forEach((record, index) => {
    const offset = HEADER_SIZE + index * RECORD_STRIDE
    view.setUint32(offset, record.sourceIdHi, true)
    view.setUint32(offset + 4, record.sourceIdLo, true)
    record.positionPc.forEach((value, axis) => view.setFloat32(offset + 8 + axis * 4, value, true))
    record.velocityPcPerYear.forEach((value, axis) => view.setFloat32(offset + 20 + axis * 4, value, true))
    view.setFloat32(offset + 32, record.absoluteMagnitude, true)
    view.setFloat32(offset + 36, record.colorIndex, true)
    view.setUint32(offset + 40, record.qualityFlags, true)
    view.setUint32(offset + 44, record.nameIndex, true)
  })
  return buffer
}

function parseCsvLine(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(value); value = ''
    } else value += char
  }
  values.push(value)
  return values
}

export function parseCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).filter(Boolean).map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])))
}

export function selectLod(records, { midLimit = 12_000, farLimit = 12_000 } = {}) {
  const brightest = (records, limit) => records.sort((left, right) => left.absoluteMagnitude - right.absoluteMagnitude || left.distancePc - right.distancePc).slice(0, limit)
  return {
    near: records.filter((record) => record.distancePc <= 25),
    mid: brightest(records.filter((record) => record.distancePc > 25 && record.distancePc <= 50), midLimit),
    far: brightest(records.filter((record) => record.distancePc > 50 && record.distancePc <= 100), farLimit),
  }
}

export function findLandmarkMatches(records, landmarks) {
  return landmarks.flatMap((landmark) => {
    const ra = landmark.ra * Math.PI / 180
    const dec = landmark.dec * Math.PI / 180
    const target = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
    let best = null
    let bestDot = -1
    for (const record of records) {
      const dot = record.positionPc.reduce((sum, component, axis) => sum + component / record.distancePc * target[axis], 0)
      if (dot > bestDot) { best = record; bestDot = dot }
    }
    if (!best || bestDot < Math.cos(0.15 * Math.PI / 180)) return []
    const sourceId = ((BigInt(best.sourceIdHi) << 32n) | BigInt(best.sourceIdLo)).toString()
    return [{ id: landmark.id, label: landmark.label, englishLabel: landmark.englishLabel, sourceId, distancePc: best.distancePc, radialVelocityKnown: (best.qualityFlags & 1) === 0 }]
  })
}

export const GAIA_BINARY = { MAGIC, HEADER_SIZE, RECORD_STRIDE }
