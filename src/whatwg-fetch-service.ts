import { isPeerId, type Logger, type PeerId, type Startable } from '@libp2p/interface'
import { multiaddr, protocols, type Multiaddr } from '@multiformats/multiaddr'
import { multiaddrToUri } from '@multiformats/multiaddr-to-uri'
import { PROTOCOL_NAME, WELL_KNOWN_PROTOCOLS } from './constants.js'
import { fetchViaDuplex, handleRequestViaDuplex, type HTTPHandler } from './fetch/index.js'
import { WellKnownHandler, type ProtosMap } from './well-known-handler.js'
import type { CustomHTTPHandlerInit, FetchComponents, HTTPInit, HTTP as WHATWGFetchInterface } from './index.js'
import type { IncomingStreamData } from '@libp2p/interface-internal'

export type { ProtosMap } from './well-known-handler.js'

const multiaddrURIPrefix = 'multiaddr:'

type ProtocolID = string
type ProtoHandlers = Record<ProtocolID, HTTPHandler>

export class WHATWGFetch implements Startable, WHATWGFetchInterface {
  private readonly log: Logger
  public readonly protocol: string = PROTOCOL_NAME
  private readonly components: FetchComponents
  private started: boolean
  private readonly _fetch: (request: Request) => Promise<Response>
  private readonly customHTTPHandler?: (request: Request) => Promise<Response>
  private readonly wellKnownProtosCache = new LRUCache<Multiaddr, ProtosMap>(100)
  private readonly wellKnownHandler = new WellKnownHandler()
  // Used when matching paths to protocols. We match from most specific to least specific.
  private readonly myProtosSortedByLength: Array<{ proto: ProtocolID, path: string }> = []
  private readonly protoHandlers: ProtoHandlers = {}

  _hasCustomHandler (h: HTTPInit | CustomHTTPHandlerInit): h is CustomHTTPHandlerInit {
    return (h as CustomHTTPHandlerInit).customHTTPHandler !== undefined
  }

  constructor (components: FetchComponents, init: HTTPInit | (HTTPInit & CustomHTTPHandlerInit)) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:http-fetch')
    this.started = false
    if (init.fetch != null) {
      this._fetch = init.fetch
    } else if (typeof globalThis.fetch === 'function') {
      this._fetch = globalThis.fetch
    } else {
      throw new Error('No fetch implementation provided and global fetch is not available')
    }

    if (this._hasCustomHandler(init)) {
      this.customHTTPHandler = init.customHTTPHandler
    }
  }

  async start (): Promise<void> {
    await this.components.registrar.handle(this.protocol, (data: IncomingStreamData) => {
      void this.handleMessage(data).catch((err) => {
        this.log.error('error handling perf protocol message', err)
      })
    }, {})
    this.started = true
  }

  async stop (): Promise<void> {
    await this.components.registrar.unhandle(this.protocol)
    this.started = false
  }

  isStarted (): boolean {
    return this.started
  }

  private async handleMessage (data: IncomingStreamData): Promise<void> {
    const { stream } = data
    try {
      if (this.customHTTPHandler != null) {
        await handleRequestViaDuplex(stream, this.customHTTPHandler)
        return
      }
      await handleRequestViaDuplex(stream, this.defaultMuxer.bind(this))
    } catch (err) {
      this.log.error('Error handling message', err)
    }
  }

  private async defaultMuxer (req: Request): Promise<Response> {
    try {
      const url = new URL(req.url)
      if (url.pathname === WELL_KNOWN_PROTOCOLS) {
        return await this.serveWellKnownProtocols(req)
      }
      for (const p of this.myProtosSortedByLength) {
        if (url.pathname.startsWith(p.path)) {
          const handler = this.protoHandlers[p.proto]
          if (handler != null) {
            return await handler(req)
          }
        }
      }

      // No handler found, 404
      return new Response(null, { status: 404 })
    } catch (err) {
      this.log.error('Error in defaultMuxer', err)
      return new Response(null, { status: 500 })
    }
  }

  async serveWellKnownProtocols (req: Request): Promise<Response> {
    return this.wellKnownHandler.handleRequest(req)
  }

  async fetch (request: string | Request, requestInit?: RequestInit): Promise<Response> {
    if (typeof request === 'string') {
      return this.innerFetch(new Request(request, requestInit ?? {}))
    }
    return this.innerFetch(request)
  }

  private async innerFetch (request: Request): Promise<Response> {
    // Get the peer from the request
    const { url } = request
    if (url.startsWith(multiaddrURIPrefix)) {
      const ma = multiaddr(url.substring(multiaddrURIPrefix.length))
      const peerWithoutHTTPPath = ma.decapsulateCode(protocols('http-path').code)

      if (this.isHTTPTransportMultiaddr(peerWithoutHTTPPath)) {
        if (peerWithoutHTTPPath.getPeerId() !== null) {
          throw new Error('HTTP Transport does not yet support peer IDs. Use a stream based transport instead.')
        }
        const [, httpPathVal] = ma.stringTuples().find(([code]) =>
          code === protocols('http-path').code
        ) ?? ['', '']
        let path = decodeURIComponent(httpPathVal ?? '')
        if (!path.startsWith('/')) {
          path = `/${path}`
        }
        const reqUrl = `${multiaddrToUri(peerWithoutHTTPPath)}${path}`
        // We want to make a request over native fetch, so we need to copy the
        // request and change the URL to be an HTTP URI
        return this._fetch(new Request(reqUrl, {
          body: request.body,
          // @ts-expect-error - TS doesn't know about this property
          duplex: request.duplex ?? 'half',
          headers: request.headers,
          cache: request.cache,
          credentials: request.credentials,
          integrity: request.integrity,
          keepalive: request.keepalive,
          method: request.method,
          mode: request.mode,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          signal: request.signal
        }))
      } else {
        const conn = await this.components.connectionManager.openConnection(peerWithoutHTTPPath)

        const s = await conn.newStream(PROTOCOL_NAME)
        return fetchViaDuplex(s)(request)
      }
    }
    // Use browser fetch or polyfill...
    return this._fetch(request)
  }

  private isHTTPTransportMultiaddr (peer: Multiaddr): boolean {
    const parts = peer.protos()
    if (parts.length === 0) {
      throw new Error('peer multiaddr must have at least one part')
    }

    // Reverse order for faster common case (/http is near the end)
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].name === 'http' || parts[i].name === 'https') {
        return true
      }
    }
    return false
  }

  // Register a protocol with a path and remember it so we can tell our peers
  // about it via .well-known
  registerProtocol (protocol: string, path: string): void {
    if (path === '') {
      path = '/'
    }
    if (!path.startsWith('/')) {
      path = `/${path}`
    }
    this.wellKnownHandler.registerProtocol(protocol, path)
    this.myProtosSortedByLength.push({ proto: protocol, path })
    this.myProtosSortedByLength.sort(({ path: a }, { path: b }) => b.length - a.length)
  }

  handleHTTPProtocol (protocol: ProtocolID, path: string, handler: (req: Request) => Promise<Response>): void {
    this.registerProtocol(protocol, path)
    this.protoHandlers[protocol] = handler
  }

  async getPeerMeta (peerOrMultiaddr: PeerId | Multiaddr): Promise<ProtosMap> {
    const peerAddr: Multiaddr = isPeerId(peerOrMultiaddr) ? multiaddr(`/p2p/${peerOrMultiaddr.toString()}`) : peerOrMultiaddr
    let cacheKey = peerAddr

    if (!isPeerId(peerOrMultiaddr)) {
      const peerIdStr = peerAddr.getPeerId()
      if (peerIdStr !== null) {
        // If we have a peer ID, we should use it as the key, since the same peer can have multiple addresses
        cacheKey = multiaddr(`/p2p/${peerIdStr}`)
      }
    }

    const cached = this.wellKnownProtosCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    const reqUrl = multiaddrURIPrefix + peerAddr.encapsulate(`/http-path/${encodeURIComponent(WELL_KNOWN_PROTOCOLS)}`).toString()
    const resp = await this.fetch(new Request(reqUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    }))
    if (resp.status !== 200) {
      throw new Error(`Unexpected status code: ${resp.status}`)
    }
    const peerMeta = await resp.json()
    this.wellKnownProtosCache.set(cacheKey, peerMeta)
    return peerMeta
  }

  async prefixForProtocol (peer: PeerId | Multiaddr, protocol: string): Promise<string> {
    const peerMeta = await this.getPeerMeta(peer)
    if (peerMeta[protocol] == null) {
      throw new Error(`Peer does not serve protocol: ${protocol}`)
    }
    return peerMeta[protocol].path
  }
}

class LRUCache<K, V> {
  private readonly size: number
  private readonly cache: Map<K, V>
  constructor (size: number) {
    this.size = size
    this.cache = new Map()
  }

  get (key: K): V | undefined {
    const v = this.cache.get(key)
    if (v != null) {
      // Move to front
      this.cache.delete(key)
      this.cache.set(key, v)
    }
    return v
  }

  set (key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.size) {
      this.cache.delete(this.cache.keys().next().value)
    }
    this.cache.set(key, value)
  }
}
