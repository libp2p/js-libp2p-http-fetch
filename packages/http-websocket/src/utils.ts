import { HTTPParser } from '@achingbrain/http-parser-js'
import { Response, BAD_REQUEST, toUint8Array, writeHeaders, getServerUpgradeHeaders } from '@libp2p/http-utils'
import { InvalidParametersError, StreamMessageEvent } from '@libp2p/interface'
import { base64pad } from 'multiformats/bases/base64'
import { raceEvent } from 'race-event'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { StreamWebSocket } from './websocket.ts'
import type { HeaderInfo } from '@libp2p/http-utils'
import type { AbortOptions, Stream } from '@libp2p/interface'

export function toBytes (data: string | Blob | BufferSource): Uint8Array | Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) {
    return toUint8Array(data)
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  if (typeof data === 'string') {
    return uint8ArrayFromString(data)
  }

  if (data instanceof Blob) {
    return data.arrayBuffer()
      .then(buf => toUint8Array(buf))
  }

  throw new InvalidParametersError('Unsupported data type')
}

export class CodeError extends Error {
  public readonly code: number

  constructor (message: string, code?: number) {
    super(message)
    this.code = code ?? 0
  }
}

export async function readResponse (stream: Stream, options: AbortOptions): Promise<Response> {
  return new Promise((resolve, reject) => {
    let readHeaders = false

    const parser = new HTTPParser('RESPONSE')
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      readHeaders = true

      const headers: Array<[string, string]> = []

      for (let i = 0; i < info.headers.length; i += 2) {
        headers.push([info.headers[i], info.headers[i + 1]])
      }

      resolve(new Response(null, {
        status: info.statusCode,
        statusText: info.statusMessage,
        headers: new Headers(headers)
      }))
    }

    Promise.resolve()
      .then(async () => {
        while (true) {
          const { data } = await raceEvent<StreamMessageEvent>(stream, 'message', options.signal)
          const buf = data.subarray()

          const read = parser.execute(buf, 0, buf.byteLength)

          if (read instanceof Error) {
            throw read
          }

          if (read < buf.byteLength) {
            // reading headers finished and we have early data
            stream.push(buf.subarray(read))
          }

          if (readHeaders) {
            break
          }
        }
      })
      .catch((err: Error) => {
        reject(err)
      })
  })
}

/**
 * Implements the WebSocket handshake from the client's perspective
 */
export async function * performClientUpgrade (url: URL, protocols: string[] = [], headers: Headers): AsyncGenerator<Uint8Array> {
  const webSocketKey = base64pad.encode(
    crypto.getRandomValues(new Uint8Array(16))
  ).substring(1)

  headers.set('host', url.hostname)
  headers.set('connection', 'upgrade')
  headers.set('upgrade', 'websocket')
  headers.set('pragma', 'no-cache')
  headers.set('cache-control', 'no-cache')
  headers.set('sec-websocket-version', '13')
  headers.set('sec-websocket-key', webSocketKey)

  if (protocols.length > 0) {
    headers.set('sec-websocket-protocol', protocols.join(', '))
  }

  yield uint8ArrayFromString([
    `GET ${url.pathname ?? '/'} HTTP/1.1`,
    ...[...headers.entries()].map(([key, value]) => `${key}: ${value}`),
    '',
    ''
  ].join('\r\n'))
}

/**
 * Implements the WebSocket handshake from the server's perspective
 */
export async function * performServerUpgrade (headers: Headers | Record<string, string | string[] | undefined>): AsyncGenerator<Uint8Array> {
  try {
    const responseHeaders = await getServerUpgradeHeaders(headers)

    const message = [
      'HTTP/1.1 101 Switching Protocols',
      ...writeHeaders(responseHeaders),
      '',
      ''
    ]

    yield uint8ArrayFromString(message.join('\r\n'))
  } catch {
    yield BAD_REQUEST
  }
}

export function streamToWebSocket (info: HeaderInfo, stream: Stream): WebSocket {
  return new StreamWebSocket(info, stream)
}
