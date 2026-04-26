import { net } from 'electron'
import { createInnertubeHeaders, type InnertubeClient } from '../authentication/youtubeAuth'
import { getInnertubeEndpointUrl, getWebRemixClientVersion } from '../config/innertube'

const CLIENT_NAME = 'WEB_REMIX'
const CLIENT_ID = '67'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

let visitorData: string | null = null

const createBody = (payload: Record<string, unknown>, client: InnertubeClient) => ({
  context: {
    client: {
      clientName: client.clientName,
      clientVersion: client.clientVersion,
      hl: 'pt-BR',
      gl: 'BR',
      visitorData: visitorData ?? undefined,
    },
  },
  ...payload,
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const innertubeRequest = async (
  endpoint: string,
  payload: Record<string, unknown>,
  maxAttempts = 3,
): Promise<unknown> => {
  const defaultClientVersion = await getWebRemixClientVersion()
  const client = (payload.__client as InnertubeClient | undefined) ?? {
    clientName: CLIENT_NAME,
    clientVersion: defaultClientVersion,
    clientId: CLIENT_ID,
    userAgent: USER_AGENT,
  }
  const { __client, ...safePayload } = payload
  const useAuthenticatedHeaders = client.clientName === 'WEB_REMIX'
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await net.fetch(await getInnertubeEndpointUrl(endpoint), {
        method: 'POST',
        credentials: useAuthenticatedHeaders ? 'include' : 'omit',
        headers: await createInnertubeHeaders(client, visitorData, {
          includeAuth: useAuthenticatedHeaders,
        }),
        body: JSON.stringify(createBody(safePayload, client)),
      })

      if (!response.ok) {
        throw new Error(`InnerTube respondeu com status ${response.status}`)
      }

      const data = (await response.json()) as { responseContext?: { visitorData?: string } }

      if (data?.responseContext?.visitorData) {
        visitorData = data.responseContext.visitorData
      }

      return data
    } catch (error) {
      lastError = error

      if (attempt < maxAttempts) {
        await wait(400 * attempt)
        continue
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao acessar InnerTube')
}
