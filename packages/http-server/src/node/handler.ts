import { normalizeUrl } from '@libp2p/http-utils'
import { readableToReadableStream } from '../utils.ts'
import type { HTTP } from '@libp2p/http'
import type { Libp2p } from '@libp2p/interface'
import type { ServerResponse, IncomingMessage } from 'node:http'
import type { WebSocket as WSSWebSocket } from 'ws'

export interface CanHandle {
  /**
   * Pass either a WebSocket instance or a IncomingMessage/ServerResponse pair
   */
  (ws: WebSocket): boolean
  (req: IncomingMessage, res: ServerResponse): boolean
}

/**
 * Helper function to determine whether the passed libp2p node handled the
 * incoming HTTP or WebSocket request.
 *
 * @example Delegating handling of HTTP requests
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { canHandle } from '@libp2p/http/servers'
 * import createServer from 'node:http'
 *
 * const libp2p = await createLibp2p({
 *   // ...options
 * })
 *
 * const handled = canHandle(libp2p)
 *
 * createServer((req, res) => {
 *   if (handled(req, res)) {
 *     // libp2p handled the request, nothing else to do
 *     return
 *   }
 *
 *   // handle request normally - pass off to express/fastify/etc or return 404
 * })
 * ```
 */
export function canHandle (libp2p: Libp2p<{ http: HTTP }>): CanHandle {
  return (...args: any[]): boolean => {
    if (args.length === 1) {
      const ws: WebSocket = args[0]

      if (libp2p.services.http.canHandle(ws)) {
        libp2p.services.http.onWebSocket(ws)
        return true
      }
    } else if (args.length === 2) {
      const req: IncomingMessage = args[0]
      const res: ServerResponse = args[1]

      if (libp2p.services.http.canHandle(req)) {
        libp2p.services.http.onRequest(incomingMessageToRequest(req))
          .then(result => {
            writeResponse(result, res)
          })
          .catch(err => {
            res.writeHead(500, err.toString())
            res.end()
          })
        return true
      }
    }

    return false
  }
}

/**
 * Adds properties/methods to a `WebSocket` instance from the `ws` module to be
 * compatible with the `globalThis.WebSocket` API
 */
export function toWebSocket (ws: WSSWebSocket, req: IncomingMessage): WebSocket {
  const url = normalizeUrl(req)

  Object.defineProperty(ws, 'url', {
    value: url.toString(),
    writable: false
  })

  // @ts-expect-error not a WS/WebSocket method
  ws.dispatchEvent = (evt: Event) => {
    if (evt.type === 'close') {
      ws.emit('close')
    }

    if (evt.type === 'open') {
      ws.emit('open')
    }

    if (evt.type === 'message') {
      const m = evt as MessageEvent
      ws.emit('data', m.data)
    }

    if (evt.type === 'error') {
      ws.emit('error', new Error('An error occurred'))
    }
    ws.emit(evt.type, evt)
  }

  // @ts-expect-error ws is now WebSocket
  return ws
}

function incomingMessageToRequest (req: IncomingMessage): Request {
  const headers = incomingHttpHeadersToHeaders(req.headers)
  const init: RequestInit = {
    method: req.method,
    headers
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // @ts-expect-error this is required by NodeJS despite being the only reasonable option https://fetch.spec.whatwg.org/#requestinit
    init.duplex = 'half'
    init.body = readableToReadableStream(req)
  }

  const url = new URL(`http://${headers.get('host') ?? 'example.com'}${req.url ?? '/'}`)

  return new Request(url, init)
}

function incomingHttpHeadersToHeaders (input: IncomingMessage['headers']): Headers {
  const headers = new Headers()

  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const val of value) {
        headers.append(key, val)
      }
    } else {
      headers.set(key, value)
    }
  }

  return headers
}

function writeResponse (res: Response, ser: ServerResponse): void {
  ser.statusCode = res.status
  ser.statusMessage = res.statusText

  res.headers.forEach((val, key) => {
    ser.setHeader(key, val)
  })

  if (res.body == null) {
    ser.end()
  } else {
    const reader = res.body.getReader()

    Promise.resolve().then(async () => {
      while (true) {
        const { done, value } = await reader.read()

        if (value != null) {
          ser.write(value)
        }

        if (done) {
          break
        }
      }

      ser.end()
    })
      .catch(err => {
        ser.end(err)
      })
  }
}
