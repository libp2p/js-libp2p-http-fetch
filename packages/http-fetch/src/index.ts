/**
 * @packageDocumentation
 *
 * This is an implementation of the [fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 * that uses libp2p streams as the underlying transport layer, instead of a TCP
 * socket.
 */

import { readResponse } from './read-response.ts'
import { sendRequest } from './send-request.ts'
import type { Logger, Stream } from '@libp2p/interface'

export interface FetchInit extends RequestInit {
  /**
   * The maximum number of bytes that will be parsed as headers, defaults to
   * 80KB
   *
   * @default 81_920
   */
  maxHeaderSize?: number
}

export interface SendRequestInit extends RequestInit {
  log: Logger
  maxHeaderSize?: number
}

export async function fetch (stream: Stream, resource: string | URL, init: FetchInit = {}): Promise<Response> {
  const log = stream.log.newScope('http-fetch')
  resource = typeof resource === 'string' ? new URL(resource) : resource

  const [
    response
  ] = await Promise.all([
    readResponse(stream, resource, {
      ...init,
      log
    }),
    sendRequest(stream, resource, {
      ...init,
      log
    })
  ])

  // close our writable end we've sent the request
  await stream.close({
    signal: init.signal ?? undefined
  })

  return response
}
