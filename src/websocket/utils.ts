import { HTTPParser } from '@achingbrain/http-parser-js'
import { InvalidParametersError, ProtocolError } from '@libp2p/interface'
import { base64pad } from 'multiformats/bases/base64'
import { sha1 } from 'multiformats/hashes/sha1'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { BAD_REQUEST, toUint8Array } from '../utils.js'
import { StreamWebSocket } from './websocket.js'
import type { HeaderInfo } from '../index.js'
import type { AbortOptions, Stream } from '@libp2p/interface'
import type { ByteStream } from 'it-byte-stream'

export function toBytes (data: string | Blob | Uint8Array | ArrayBuffer | DataView): Uint8Array | Promise<Uint8Array> {
  if (data instanceof Uint8Array || data instanceof ArrayBuffer || data instanceof DataView) {
    return toUint8Array(data)
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

export interface Response {
  status: number
  statusText: string
  headers: Headers
}

export async function readResponse (bytes: ByteStream, options: AbortOptions): Promise<Response> {
  return new Promise((resolve, reject) => {
    let readHeaders = false

    const parser = new HTTPParser('RESPONSE')
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      readHeaders = true

      const headers: Array<[string, string]> = []

      for (let i = 0; i < info.headers.length; i += 2) {
        headers.push([info.headers[i], info.headers[i + 1]])
      }

      resolve({
        status: info.statusCode,
        statusText: info.statusMessage,
        headers: new Headers(headers)
      })
    }

    Promise.resolve()
      .then(async () => {
        while (true) {
          if (readHeaders) {
            break
          }

          const chunk = await bytes.read(options)

          if (chunk == null) {
            throw new Error('Stream ended before headers were received')
          }

          parser.execute(chunk.subarray(), 0, chunk.byteLength)
        }
      })
      .catch((err: Error) => {
        reject(err)
      })
  })
}

function getHeader (headers: Headers | Record<string, string | string[] | undefined>, key: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined
  }

  const header = headers[key]

  if (Array.isArray(header)) {
    return header.join(',')
  }

  return header
}

/**
 * Implements the WebSocket handshake from the client's perspective
 */
export async function * performClientUpgrade (url: URL, protocols: string[] = []): AsyncGenerator<Uint8Array> {
  const webSocketKey = base64pad.encode(
    crypto.getRandomValues(new Uint8Array(16))
  ).substring(1)

  const headers = [
    `GET ${url.pathname ?? '/'} HTTP/1.1`,
    `Host: ${url.hostname}`,
    'Connection: upgrade',
    'Upgrade: websocket',
    'Pragma: no-cache',
    'Cache-Control: no-cache',
    'Sec-WebSocket-Version: 13',
    `Sec-WebSocket-Key: ${webSocketKey}`
  ]

  if (protocols.length > 0) {
    headers.push(`Sec-WebSocket-Protocol: ${protocols?.join(', ')}`)
  }

  headers.push('', '')

  const req = uint8ArrayFromString(headers.join('\r\n'))
  yield req
}

/**
 * Implements the WebSocket handshake from the server's perspective
 */
export async function * performServerUpgrade (headers: Headers | Record<string, string | string[] | undefined>): AsyncGenerator<Uint8Array> {
  if (getHeader(headers, 'sec-websocket-version') !== '13') {
    yield BAD_REQUEST
    throw new ProtocolError('Invalid version')
  }

  const secWebSocketKey = getHeader(headers, 'sec-websocket-key')

  if (secWebSocketKey == null) {
    yield BAD_REQUEST
    throw new ProtocolError('Missing sec-websocket-key')
  }

  const token = `${secWebSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`
  const hash = await sha1.digest(uint8ArrayFromString(token))
  const webSocketAccept = base64pad.encode(
    hash.digest
  ).substring(1)

  const message = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: upgrade',
    `Sec-WebSocket-Accept: ${webSocketAccept}`,
    '',
    ''
  ]

  yield uint8ArrayFromString(message.join('\r\n'))
}

export function streamToWebSocket (info: HeaderInfo, stream: Stream): WebSocket {
  return new StreamWebSocket(info, stream)
}
