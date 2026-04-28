import { spawn } from 'child_process'

const YT_DLP_FAILURE_TTL_MS = 5 * 60 * 1000
const YT_DLP_PROCESS_TIMEOUT_MS = 90_000

type CommandCandidate = {
  command: string
  args: string[]
}

export const COMMAND_CANDIDATES: CommandCandidate[] = [
  {
    command: 'yt-dlp',
    args: [],
  },
  {
    command: 'python',
    args: ['-m', 'yt_dlp'],
  },
]

let unavailableUntil = 0
let lastFailure: Error | null = null

const runCommand = (candidate: CommandCandidate, videoId: string) =>
  new Promise<string>((resolve, reject) => {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`
    const proc = spawn(candidate.command, [
      ...candidate.args,
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '-g',
      '--no-warnings',
      targetUrl,
    ])

    let stdout = ''
    let stderr = ''
    let settled = false

    // Timeout: mata o processo se demorar mais que YT_DLP_PROCESS_TIMEOUT_MS
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        try { proc.kill('SIGKILL') } catch {}
        reject(new Error(`${candidate.command} excedeu o timeout de ${YT_DLP_PROCESS_TIMEOUT_MS / 1000}s`))
      }
    }, YT_DLP_PROCESS_TIMEOUT_MS)

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', (error) => {
      if (!settled) {
        settled = true
        clearTimeout(timeoutId)
        reject(error)
      }
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)

      if (code !== 0) {
        reject(new Error(stderr.trim() || `${candidate.command} retornou codigo ${code}`))
        return
      }

      const resolvedUrl = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      if (!resolvedUrl) {
        reject(new Error(`${candidate.command} nao retornou URL de audio`))
        return
      }

      resolve(resolvedUrl)
    })
  })

export const resolveYtDlpAudioUrl = async (videoId: string) => {
  if (Date.now() < unavailableUntil && lastFailure) {
    throw lastFailure
  }

  const failures: string[] = []

  for (const candidate of COMMAND_CANDIDATES) {
    try {
      const resolvedUrl = await runCommand(candidate, videoId)
      unavailableUntil = 0
      lastFailure = null
      return resolvedUrl
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  const aggregatedError = new Error(failures.join(' | ') || 'yt-dlp indisponivel')
  unavailableUntil = Date.now() + YT_DLP_FAILURE_TTL_MS
  lastFailure = aggregatedError
  throw aggregatedError
}
