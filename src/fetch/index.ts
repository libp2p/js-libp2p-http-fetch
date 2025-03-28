import { byteStream } from 'it-byte-stream'
import { readResponse } from './read-response.js'
import { sendRequest } from './send-request.js'
import type { ComponentLogger, Logger, Stream } from '@libp2p/interface'

export interface FetchInit extends RequestInit {
  logger: ComponentLogger
}

export interface SendRequestInit extends RequestInit {
  log: Logger
}

export async function fetch (stream: Stream, resource: string | URL, init: FetchInit): Promise<Response> {
  const log = init.logger.forComponent('libp2p:http:fetch')
  resource = typeof resource === 'string' ? new URL(resource) : resource
  const bytes = byteStream(stream)

  await sendRequest(bytes, resource, {
    ...init,
    log
  })

  return readResponse(bytes, resource, {
    ...init,
    log
  })
}
