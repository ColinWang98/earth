export interface DecodedGaiaCatalog {
  count: number
  positions: Float32Array
  velocities: Float32Array
  colors: Float32Array
  magnitudes: Float32Array
  qualityFlags: Uint32Array
  nameIndices: Uint32Array
  sourceIds: string[]
}

export function propagatedPosition(positionPc: readonly number[], velocityPcPerYear: readonly number[], year: number): [number, number, number] {
  const elapsedYears = year - 2016
  return [
    positionPc[0] + velocityPcPerYear[0] * elapsedYears,
    positionPc[1] + velocityPcPerYear[1] * elapsedYears,
    positionPc[2] + velocityPcPerYear[2] * elapsedYears,
  ]
}

export function decodeGaiaCatalog(buffer: ArrayBuffer): DecodedGaiaCatalog {
  const view = new DataView(buffer)
  if (view.byteLength < 16 || view.getUint32(0, true) !== 0x31494147) throw new Error('Invalid Gaia catalogue header')
  const version = view.getUint16(4, true)
  const stride = view.getUint16(6, true)
  const count = view.getUint32(8, true)
  if (version !== 1 || stride !== 48 || view.byteLength !== 16 + count * stride) throw new Error('Unsupported Gaia catalogue schema')

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const magnitudes = new Float32Array(count)
  const qualityFlags = new Uint32Array(count)
  const nameIndices = new Uint32Array(count)
  const sourceIds = new Array<string>(count)

  for (let index = 0; index < count; index += 1) {
    const offset = 16 + index * stride
    const high = view.getUint32(offset, true)
    const low = view.getUint32(offset + 4, true)
    sourceIds[index] = ((BigInt(high) << 32n) | BigInt(low)).toString()
    for (let axis = 0; axis < 3; axis += 1) {
      positions[index * 3 + axis] = view.getFloat32(offset + 8 + axis * 4, true)
      velocities[index * 3 + axis] = view.getFloat32(offset + 20 + axis * 4, true)
    }
    const magnitude = view.getFloat32(offset + 32, true)
    const colorIndex = Math.max(-0.4, Math.min(3, view.getFloat32(offset + 36, true)))
    const temperature = Math.max(0, Math.min(1, (colorIndex + 0.4) / 3.4))
    colors.set([1, 0.88 - temperature * 0.25, 0.72 + (1 - temperature) * 0.28], index * 3)
    magnitudes[index] = magnitude
    qualityFlags[index] = view.getUint32(offset + 40, true)
    nameIndices[index] = view.getUint32(offset + 44, true)
  }

  return { count, positions, velocities, colors, magnitudes, qualityFlags, nameIndices, sourceIds }
}
