import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')
const packageJsonPath = path.join(projectRoot, 'package.json')
const publicDir = path.join(projectRoot, 'public')
const buildMetaPath = path.join(publicDir, 'build-meta.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

let commitSha = 'development'
let shortCommitSha = 'dev'

try {
  commitSha = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  shortCommitSha = commitSha.slice(0, 7)
} catch {
  // Mantem um fallback estavel quando o projeto nao esta num checkout git.
}

const metadata = {
  appId: packageJson.build?.appId ?? 'com.windsound.app',
  name: packageJson.name ?? 'windsound',
  productName: packageJson.build?.productName ?? 'WindSound',
  version: packageJson.version ?? '0.0.0',
  commitSha,
  shortCommitSha,
  generatedAt: new Date().toISOString(),
  repository: 'murasssh/WindSound',
}

mkdirSync(publicDir, { recursive: true })
writeFileSync(buildMetaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

console.log(`[WindSound] build-meta sincronizado em ${buildMetaPath}`)
