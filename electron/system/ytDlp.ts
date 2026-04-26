import { spawn } from 'child_process'

const YT_DLP_FAILURE_TTL_MS = 5 * 60 * 1000

type CommandCandidate = {
  command: string
  args: string[]
}

const COMMAND_CANDIDATES: CommandCandidate[] = [
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
    const process = spawn(candidate.command, [
      ...candidate.args,
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '-g',
      '--no-warnings',
      targetUrl,
    ])

    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    process.on('error', (error) => {
      reject(error)
    })

    process.on('close', (code) => {
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
