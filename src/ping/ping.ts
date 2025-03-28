// http-ping implementation
import { ProtocolError, serviceDependencies } from '@libp2p/interface'
import { raceEvent } from 'race-event'
import { raceSignal } from 'race-signal'
import { equals as uint8ArrayEquals } from 'uint8arrays/equals'
import { toMultiaddrs } from '../utils.js'
import { HTTP_PING_PROTOCOL } from './index.js'
import type { PingHTTPComponents, PingHTTP as PingHTTPInterface, PingOptions } from './index.js'
import type { PeerId, Startable } from '@libp2p/interface'
import type { AbortOptions, Multiaddr } from '@multiformats/multiaddr'

const PING_SIZE = 32

export class PingHTTPService implements PingHTTPInterface, Startable {
  private readonly components: PingHTTPComponents

  constructor (components: PingHTTPComponents) {
    this.components = components

    this.onHTTPRequest = this.onHTTPRequest.bind(this)
    this.onWebSocket = this.onWebSocket.bind(this)
  }

  readonly [Symbol.toStringTag] = '@libp2p/ping-http'

  readonly [serviceDependencies]: string[] = [
    '@libp2p/http'
  ]

  start (): void {
    this.components.http.handleHTTPProtocol(HTTP_PING_PROTOCOL, this.onHTTPRequest)
    this.components.http.handleWebSocketProtocol(HTTP_PING_PROTOCOL, this.onWebSocket)
  }

  stop (): void {
    this.components.http.unhandleHTTPProtocol(HTTP_PING_PROTOCOL)
    this.components.http.unhandleWebSocketProtocol(HTTP_PING_PROTOCOL)
  }

  async onHTTPRequest (req: Request): Promise<Response> {
    if (req.body == null) {
      return new Response(null, { status: 400 })
    }

    const ab = await req.arrayBuffer()
    const buf = new Uint8Array(ab, 0, ab.byteLength)

    if (buf.byteLength !== PING_SIZE) {
      return new Response(null, { status: 400 })
    }

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': `${PING_SIZE}`
      }
    })
  }

  onWebSocket (ws: WebSocket): void {
    ws.addEventListener('message', (evt) => {
      const buf = new Uint8Array(evt.data, 0, evt.data.byteLength)

      if (buf.length !== PING_SIZE) {
        ws.close(400)
        return
      }

      ws.send(buf)
      ws.close()
    })
  }

  async ping (peer: PeerId | Multiaddr | Multiaddr[], options: PingOptions = {}): Promise<number> {
    const pingEndpoint = await this.components.http.getProtocolPath(peer, HTTP_PING_PROTOCOL, options)
    const dialTarget = toMultiaddrs(peer)
      .map(ma => ma.encapsulate(`/http-path/${encodeURIComponent(pingEndpoint.substring(1))}`))

    const start = Date.now()
    const buf = new Uint8Array(PING_SIZE)
    // fill buffer with random data
    crypto.getRandomValues(buf)

    const output = await raceSignal(options.webSocket === true ? this.webSocketPing(dialTarget, buf, options) : this.httpPing(dialTarget, buf, options), options?.signal)
    const respBuf = new Uint8Array(output, 0, output.byteLength)

    if (respBuf.length !== PING_SIZE) {
      throw new ProtocolError(`Unexpected response size: ${respBuf.length}`)
    }

    if (!uint8ArrayEquals(respBuf, buf)) {
      throw new ProtocolError('Ping body mismatch')
    }

    return Date.now() - start
  }

  async httpPing (dialTarget: Multiaddr[], buf: Uint8Array, options: AbortOptions): Promise<ArrayBuffer> {
    const res = await this.components.http.fetch(dialTarget, {
      ...options,
      method: 'POST',
      body: buf
    })

    if (res.status !== 200) {
      throw new ProtocolError(`Unexpected status code: ${res.status}`)
    }

    return res.arrayBuffer()
  }

  async webSocketPing (dialTarget: Multiaddr[], buf: Uint8Array, options: AbortOptions): Promise<ArrayBuffer> {
    const socket = this.components.http.connect(dialTarget, [], options)

    if (socket.readyState !== WebSocket.OPEN) {
      await raceEvent(socket, 'open', options.signal)
    }

    const p = new Promise<ArrayBuffer>((resolve, reject) => {
      socket.addEventListener('message', (evt) => {
        resolve(evt.data)
      })
      socket.addEventListener('error', () => {
        reject(new Error('An error occurred'))
      })
    })

    socket.send(buf)

    return p
  }
}
