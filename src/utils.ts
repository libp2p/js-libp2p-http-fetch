import { isPeerId } from '@libp2p/interface'
import { isMultiaddr, multiaddr } from '@multiformats/multiaddr'
import { multiaddrToUri } from '@multiformats/multiaddr-to-uri'
import { uriToMultiaddr } from '@multiformats/uri-to-multiaddr'
import { queuelessPushable } from 'it-queueless-pushable'
import itToBrowserReadableStream from 'it-to-browser-readablestream'
import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'
import type { HeaderInfo } from './index.js'
import type { PeerId, Stream } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Readable } from 'node:stream'
import type { Uint8ArrayList } from 'uint8arraylist'

const HTTP_CODEC = 0x01e0

/**
 * Normalizes byte-like input to a `Uint8Array`
 */
export function toUint8Array (obj: DataView | ArrayBuffer | Uint8Array): Uint8Array {
  if (obj instanceof Uint8Array) {
    return obj
  }

  if (obj instanceof DataView) {
    return new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength)
  }

  return new Uint8Array(obj, 0, obj.byteLength)
}

export function streamToRequest (info: HeaderInfo, stream: Stream): Request {
  const init: RequestInit = {
    method: info.method,
    headers: info.headers
  }

  if (info.method !== 'GET' && info.method !== 'HEAD') {
    init.body = itToBrowserReadableStream<Uint8Array>(takeBytes(stream.source, info.headers.get('content-length')))
    // @ts-expect-error this is required by NodeJS despite being the only reasonable option https://fetch.spec.whatwg.org/#requestinit
    init.duplex = 'half'
  }

  const req = new Request(`http://${info.headers.get('host') ?? 'host'}${info.url}`, init)

  return req
}

export async function responseToStream (res: Response, stream: Stream): Promise<void> {
  const pushable = queuelessPushable<Uint8Array>()
  stream.sink(pushable)
    .catch(err => {
      stream.abort(err)
    })

  await pushable.push(uint8arrayFromString([
    `HTTP/1.1 ${res.status} ${res.statusText}`,
    ...writeHeaders(res.headers),
    '',
    ''
  ].join('\r\n')))

  if (res.body == null) {
    await pushable.end()
    return
  }

  const reader = res.body.getReader()
  let result = await reader.read()

  while (true) {
    if (result.value != null) {
      await pushable.push(result.value)
    }

    if (result.done) {
      break
    }

    result = await reader.read()
  }

  await pushable.end()

  await stream.closeWrite()
    .catch(err => {
      stream.abort(err)
    })
}

export const NOT_FOUND_RESPONSE = uint8arrayFromString([
  'HTTP/1.1 404 Not Found',
  'Connection: close',
  '',
  ''
].join('\r\n'))

export const BAD_REQUEST = uint8arrayFromString([
  'HTTP/1.1 400 Bad Request',
  'Connection: close',
  '',
  ''
].join('\r\n'))

export const INTERNAL_SERVER_ERROR = uint8arrayFromString([
  'HTTP/1.1 500 Internal Server Error',
  'Connection: close',
  '',
  ''
].join('\r\n'))

/**
 * Normalizes the dial target to a list of multiaddrs with an optionally
 * encapsulated suffix
 */
export function toMultiaddrs (peer: PeerId | Multiaddr | Multiaddr[], suffix?: string): Multiaddr[] {
  let mas: Multiaddr[]

  if (isPeerId(peer)) {
    mas = [
      multiaddr(`/p2p/${peer}`)
    ]
  } else if (Array.isArray(peer)) {
    mas = peer
  } else {
    mas = [
      peer
    ]
  }

  if (suffix != null) {
    mas = mas.map(ma => ma.encapsulate(suffix))
  }

  return mas
}

function writeHeaders (headers: Headers): string[] {
  const output = []

  if (headers.get('Connection') == null) {
    headers.set('Connection', 'close')
  }

  for (const [key, value] of headers.entries()) {
    output.push(`${key}: ${value}`)
  }

  return output
}

export function readableToReadableStream (readable: Readable): ReadableStream {
  return new ReadableStream({
    start (controller) {
      readable.on('data', buf => {
        controller.enqueue(buf)

        // pause until more data requested (backpressure)
        readable.pause()
      })
      readable.on('end', () => {
        controller.close()
      })
      readable.on('error', (err) => {
        controller.error(err)
      })
    },
    pull () {
      // let data flow again
      readable.resume()
    }
  })
}

async function * takeBytes (source: AsyncGenerator<Uint8ArrayList>, bytes?: number | string | null): AsyncGenerator<Uint8Array> {
  bytes = parseInt(`${bytes ?? ''}`)

  if (bytes == null || isNaN(bytes)) {
    return source
  }

  let count = 0

  for await (const buf of source) {
    count += buf.byteLength

    if (count > bytes) {
      yield buf.subarray(0, count - bytes)
      return
    }

    yield buf.subarray()

    if (count === bytes) {
      return
    }
  }
}

/**
 * Attempts to convert the passed `resource` into a HTTP(s) URL or an array of
 * multiaddrs.
 *
 * The returned URL should be handled by the global fetch, the multiaddr(s)
 * should be handled by libp2p.
 */
export function toResource (resource: string | URL | Multiaddr | Multiaddr[]): URL | Multiaddr[] {
  if (typeof resource === 'string') {
    if (resource.startsWith('/')) {
      resource = multiaddr(resource)
    } else {
      resource = new URL(resource)
    }
  }

  if (resource instanceof URL) {
    if (resource.protocol === 'multiaddr:') {
      resource = uriToMultiaddr(resource.toString())
    }
  }

  if (isMultiaddr(resource)) {
    resource = [resource]
  }

  // check for `/http/` tuple and transform to URL if present
  if (Array.isArray(resource)) {
    for (const ma of resource) {
      const stringTuples = ma.stringTuples()

      if (stringTuples.find(([codec]) => codec === HTTP_CODEC) != null) {
        const uri = multiaddrToUri(ma)
        return new URL(uri)
      }
    }
  }

  return resource
}
