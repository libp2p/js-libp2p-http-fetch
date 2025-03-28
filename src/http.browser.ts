import { HTTPParser } from '@achingbrain/http-parser-js'
import { UnsupportedOperationError, serviceCapabilities } from '@libp2p/interface'
import { fromStringTuples } from '@multiformats/multiaddr'
import { queuelessPushable } from 'it-queueless-pushable'
import { Uint8ArrayList } from 'uint8arraylist'
import { PROTOCOL, WELL_KNOWN_PROTOCOLS } from './constants.js'
import { fetch } from './fetch/index.js'
import { HTTPRegistrar } from './registrar.js'
import { NOT_FOUND_RESPONSE, responseToStream, streamToRequest, toMultiaddrs, toResource } from './utils.js'
import { streamToWebSocket } from './websocket/utils.js'
import { WebSocket as WebSocketClass } from './websocket/websocket.js'
import type { Endpoint, HTTPInit, HTTP as HTTPInterface, WebSocketInit, HeaderInfo, HTTPRequestHandler, WebSocketHandler } from './index.js'
import type { ProtocolMap } from './well-known-handler.js'
import type { ComponentLogger, IncomingStreamData, Logger, PeerId, Startable, Stream } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'
import type { Multiaddr } from '@multiformats/multiaddr'

const HTTP_PATH_CODEC = 0x01e1

export interface HTTPComponents {
  registrar: Registrar
  connectionManager: ConnectionManager
  logger: ComponentLogger
}

export class HTTP implements HTTPInterface, Startable {
  private readonly log: Logger
  protected readonly components: HTTPComponents
  private readonly endpoint?: Endpoint
  private readonly httpRegistrar: HTTPRegistrar

  constructor (components: HTTPComponents, init: HTTPInit = {}) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:http')
    this.httpRegistrar = new HTTPRegistrar(components)
    this.endpoint = init.server
    this.onStream = this.onStream.bind(this)
  }

  readonly [Symbol.toStringTag] = '@libp2p/http'

  readonly [serviceCapabilities]: string[] = [
    '@libp2p/http'
  ]

  async start (): Promise<void> {
    await this.components.registrar.handle(PROTOCOL, (data) => {
      this.onStream(data)
        .catch(err => {
          this.log.error('could not handle incoming stream - %e', err)
        })
    })
  }

  async stop (): Promise<void> {
    await this.components.registrar.unhandle(PROTOCOL)
  }

  private async onStream ({ stream, connection }: IncomingStreamData): Promise<void> {
    const info = await readHeaders(stream)
    const isWebSocketRequest = info.headers.get('upgrade') === 'websocket'

    if (isWebSocketRequest && this.canHandleWebSocket(info)) {
      this.log('handling incoming request %s %s', info.method, info.url)
      this.handleWebSocket(streamToWebSocket(info, stream))
      return
    }

    if (!isWebSocketRequest && this.canHandleHTTP(info)) {
      this.log('handling incoming request %s %s', info.method, info.url)
      const res = await this.handleHTTP(streamToRequest(info, stream))
      await responseToStream(res, stream)
      await stream.close()
      return
    }

    // pass request to endpoint if available
    if (this.endpoint == null) {
      this.log('cannot handle incoming request %s %s and no endpoint configured', info.method, info.url)
      await stream.sink([NOT_FOUND_RESPONSE])
      return
    }

    this.log('passing incoming request %s %s to endpoint', info.method, info.url)
    this.endpoint.inject(info, stream, connection)
      .catch(err => {
        this.log.error('error injecting request to endpoint - %e', err)
        stream.abort(err)
      })
  }

  canHandleHTTP (req: { url?: string }): boolean {
    if (req.url == null) {
      return false
    }

    if (req.url === WELL_KNOWN_PROTOCOLS) {
      return true
    }

    // try handler registered with registrar
    if (this.httpRegistrar.canHandleHTTP(req)) {
      return true
    }

    return false
  }

  canHandleWebSocket (req: { url?: string }): boolean {
    if (req.url == null) {
      return false
    }

    if (req.url === WELL_KNOWN_PROTOCOLS) {
      return true
    }

    // try handler registered with registrar
    if (this.httpRegistrar.canHandleWebSocket(req)) {
      return true
    }

    return false
  }

  /**
   * Handle an incoming HTTP request
   */
  async handleHTTP (req: Request): Promise<Response> {
    const url = new URL(req.url)

    // serve protocol map
    if (url.pathname === WELL_KNOWN_PROTOCOLS) {
      const map = JSON.stringify(this.getProtocolMap())
      return new Response(map, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': `${map.length}`
        }
      })
    }

    // pass request to handler
    return this.httpRegistrar.handleHTTP(req)
  }

  handleWebSocket (ws: WebSocket): void {
    // serve protocol map
    if (ws.url === WELL_KNOWN_PROTOCOLS) {
      const map = JSON.stringify(this.getProtocolMap())
      ws.send(map)
      ws.close()
      return
    }

    // pass request to handler
    this.httpRegistrar.handleWebSocket(ws)
  }

  agent (...args: any[]): any {
    throw new UnsupportedOperationError('This method is not supported in browsers')
  }

  dispatcher (...args: any[]): any {
    throw new UnsupportedOperationError('This method is not supported in browsers')
  }

  connect (resource: string | URL | Multiaddr | Multiaddr[], protocols?: string[], init?: WebSocketInit): globalThis.WebSocket {
    let url = toResource(resource)

    if (url instanceof URL) {
      const socket = new globalThis.WebSocket(url, protocols)
      socket.binaryType = 'arraybuffer'

      return socket
    }

    // strip http-path tuple but record the value if set
    let httpPath = '/'
    url = url.map(ma => {
      return fromStringTuples(
        ma.stringTuples().filter(t => {
          if (t[0] === HTTP_PATH_CODEC && t[1] != null) {
            httpPath = `/${t[1]}`
          }

          return t[0] !== HTTP_PATH_CODEC
        })
      )
    })

    return new WebSocketClass(url, new URL(`http://example.com${decodeURIComponent(httpPath)}`), this.components.connectionManager, {
      ...init,
      protocols,
      isClient: true
    })
  }

  async fetch (resource: string | URL | Multiaddr | Multiaddr[], init: RequestInit = {}): Promise<Response> {
    let url = toResource(resource)

    if (url instanceof URL) {
      return globalThis.fetch(url, init)
    }

    // strip http-path tuple but record the value if set
    let httpPath = '/'
    url = url.map(ma => {
      return fromStringTuples(
        ma.stringTuples().filter(t => {
          if (t[0] === HTTP_PATH_CODEC && t[1] != null) {
            httpPath = `/${t[1]}`
          }

          return t[0] !== HTTP_PATH_CODEC
        })
      )
    })

    const connection = await this.components.connectionManager.openConnection(url, {
      signal: init.signal ?? undefined
    })
    const stream = await connection.newStream(PROTOCOL, {
      signal: init.signal ?? undefined
    })

    return fetch(stream, new URL(`http://example.com${decodeURIComponent(httpPath)}`), {
      ...init,
      logger: this.components.logger
    })
  }

  async getSupportedProtocols (peer: PeerId | Multiaddr | Multiaddr[]): Promise<ProtocolMap> {
    const addresses = toMultiaddrs(peer, `/http-path/${encodeURIComponent(WELL_KNOWN_PROTOCOLS.substring(1))}`)
    const resp = await this.fetch(addresses, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    if (resp.status !== 200) {
      throw new Error(`Unexpected status code: ${resp.status}`)
    }

    return resp.json()
  }

  async getProtocolPath (peer: PeerId | Multiaddr, protocol: string): Promise<string> {
    const peerMeta = await this.getSupportedProtocols(peer)

    if (peerMeta[protocol] == null) {
      throw new Error(`Peer does not serve protocol: ${protocol}`)
    }

    return peerMeta[protocol].path
  }

  handleHTTPProtocol (protocol: string, handler: HTTPRequestHandler, path?: string): void {
    this.httpRegistrar.handleHTTPProtocol(protocol, handler, path)
  }

  handleWebSocketProtocol (protocol: string, handler: WebSocketHandler, path?: string): void {
    this.httpRegistrar.handleWebSocketProtocol(protocol, handler, path)
  }

  unhandleHTTPProtocol (protocol: string): void {
    this.httpRegistrar.unhandleHTTPProtocol(protocol)
  }

  unhandleWebSocketProtocol (protocol: string): void {
    this.httpRegistrar.unhandleWebSocketProtocol(protocol)
  }

  getProtocolMap (): ProtocolMap {
    return this.httpRegistrar.getProtocolMap()
  }
}

/**
 * Reads HTTP headers from an incoming stream
 */
async function readHeaders (stream: Stream): Promise<HeaderInfo> {
  return new Promise<any>((resolve, reject) => {
    const parser = new HTTPParser('REQUEST')
    const source = queuelessPushable<Uint8ArrayList>()
    const earlyData = new Uint8ArrayList()
    let headersComplete = false

    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      headersComplete = true
      const headers = new Headers()

      // set incoming headers
      for (let i = 0; i < info.headers.length; i += 2) {
        headers.set(info.headers[i].toLowerCase(), info.headers[i + 1])
      }

      resolve({
        ...info,
        headers,
        raw: earlyData,
        method: HTTPParser.methods[info.method]
      })
    }

    // replace source with request body
    const streamSource = stream.source
    stream.source = source

    Promise.resolve().then(async () => {
      for await (const chunk of streamSource) {
        // only use the message parser until the headers have been read
        if (!headersComplete) {
          earlyData.append(chunk)
          parser.execute(chunk.subarray())
        } else {
          await source.push(new Uint8ArrayList(chunk))
        }
      }

      await source.end()
    })
      .catch((err: Error) => {
        stream.abort(err)
        reject(err)
      })
      .finally(() => {
        parser.finish()
      })
  })
}
