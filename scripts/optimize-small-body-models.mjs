import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'public/assets/small-bodies/sources.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const temporary = await mkdtemp(resolve(tmpdir(), 'earth-small-bodies-'))

function optimize(input, output, ratio) {
  const optimizeArgs = ['--yes', '@gltf-transform/cli@4.3.0', 'optimize', input, output, '--compress', 'quantize', '--simplify-ratio', String(ratio), '--simplify-error', '0.001', '--texture-compress', 'false']
  const windows = process.platform === 'win32'
  const command = windows ? process.env.ComSpec ?? 'cmd.exe' : 'npx'
  const args = windows ? ['/d', '/s', '/c', `npx.cmd ${optimizeArgs.map((value) => `"${value}"`).join(' ')}`] : optimizeArgs
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`glTF optimization exited with ${code}`)))
  })
}

try {
  for (const [key, model] of Object.entries(manifest.models)) {
    const response = await fetch(model.download)
    if (!response.ok) throw new Error(`${key}: NASA download returned ${response.status}`)
    const input = resolve(temporary, basename(new URL(model.download).pathname))
    const output = resolve(root, 'public', model.path)
    await mkdir(resolve(output, '..'), { recursive: true })
    await writeFile(input, Buffer.from(await response.arrayBuffer()))
    await optimize(input, output, model.simplifyRatio)
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
