/**
 * @packageDocumentation
 *
 * This module allows you to use HTTP requests as a transport for libp2p
 * protocols (libp2p over HTTP), and also libp2p streams as a transport for HTTP
 * requests (HTTP over libp2p).
 *
 * It integrates with existing Node.js friendly HTTP frameworks such as
 * [express](https://expressjs.com/) and [Fastify](https://fastify.dev) as well
 * as [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request)/
 * [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response)-based
 * frameworks like [Hono](https://hono.dev/).
 *
 * It even allows creating Node.js-style [http.Server](https://nodejs.org/api/http.html#class-httpserver)s
 * and [WebSocketServer](https://github.com/websockets/ws/blob/HEAD/doc/ws.md#class-websocketserver)s
 * (based on the [ws](https://www.npmjs.com/package/ws) module API in the
 * absence of a native Node.js API to emulate) in browsers to truly realize the
 * power of the distributed web.
 *
 * Instead of the regular "host:port" addressing, it uses a libp2p PeerId and/or
 * multiaddr(s) and lets libp2p take care of the routing, thus taking advantage
 * of features like multi-routes, NAT transversal and stream multiplexing over a
 * single connection.
 *
 * # Servers
 *
 * You can create HTTP and WebSocket servers using the framework of your choice,
 * as long as it accepts a Node.js `http.Server` instance.
 *
 * @example Node HTTP server
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { http } from '@libp2p/http'
 * import { nodeServer } from '@libp2p/http/servers/node'
 * import { createServer } from 'node:http'
 *
 * const server = createServer((req, res) => {
 *   req.end('Hello world!')
 * })
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     http: http({
 *       server: nodeServer(server)
 *     })
 *   }
 * })
 * ```
 *
 * @example Express server
 *
 * ```ts
 * import express from 'express'
 * import { http } from '@libp2p/http'
 * import { nodeServer } from '@libp2p/http/servers/node'
 * import { createServer } from 'node:http'
 *
 * // create an express app
 * const app = express()
 * app.get('/', (req, res) => {
 *   res.send('Hello World!')
 * })
 *
 * const server = createServer(app)
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     http: http({
 *       server: nodeServer(server)
 *     })
 *   }
 * })
 * ```
 *
 * @example Fastify server
 *
 *  ```ts
 * import { fastify } from 'fastify'
 * import { createLibp2p } from 'libp2p'
 * import { http } from '@libp2p/http'
 * import { nodeServer } from '@libp2p/http/servers/node'
 * import { createServer } from 'node:http'
 *
 * let server
 *
 * // create a fastify app
 * const app = fastify({
 *   serverFactory: (handler, opts) => {
 *     server = createServer((req, res) => {
 *       handler(req, res)
 *      })
 *
 *      return server
 *    }
 *  })
 * app.get('/', async (req, res) => {
 *   await res.send('Hello World!')
 * })
 * await app.ready()
 *
 * if (server == null) {
 *    throw new Error('Server not created')
 *  }
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     http: http({
 *       server: nodeServer(server)
 *     })
 *   }
 * })
 * ```
 *
 * @example ws WebSocket server
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpServer } from '@libp2p/http'
 * import { createServer } from 'node:http'
 * import { WebSocketServer } from 'ws'
 *
 * const wss = new WebSocketServer({ noServer: true })
 * wss.on('connection', (ws) => {
 *   ws.on('message', (data) => {
 *     ws.send(data)
 *   })
 * })
 *
 * const server = createServer((req, res) => {
 *   req.end('Hello world!')
 * })
 *
 * server.on('upgrade', (request, socket, head) => {
 *   wss.handleUpgrade(request, socket, head, (ws) => {
 *     wss.emit('connection', ws, request)
 *   })
 * })
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpServer: httpServer({ server })
 *   }
 * })
 * ```
 *
 * # Clients
 *
 * You can use the built-in `.fetch` and `.connect` methods to make HTTP or
 * WebSocket requests respectively, or you can create a Node.js `http.Agent` for
 * use with the `node:http`, or a `Dispatcher` for use with `undici`.
 *
 * @example Using fetch to make a HTTP request
 *
 * This example works in all JavaScript environments, Node.js and browsers too!
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { http } from '@libp2p/http'
 * import { peerIdFromString } from '@libp2p/peer-id'
 * import { multiaddr } from '@multiformats/multiaddr'
 *
 * const client = await createLibp2p({
 *   // ...other options
 *   services: {
 *     http: http()
 *   }
 * })
 *
 * const peerId = peerIdFromString('12DKoo')
 * const ma = multiaddr(`/p2p/${peerId}/http`)
 * const response = await client.services.httpClient.fetch(ma, {
 *   signal: AbortSignal.timeout(10_000)
 * })
 *
 * console.info('Response:', response.status)
 * // Response: 200
 *
 * console.info(await response.text())
 * // Hello world!
 * ```
 *
 * @example Using connect to create a WebSocket
 *
 * This example works in all JavaScript environments, Node.js and browsers too!
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpClient } from '@libp2p/http'
 * import { peerIdFromString } from '@libp2p/peer-id'
 *
 * const client = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpClient: httpClient()
 *   }
 * })
 *
 * const peerId = peerIdFromString('12DKoo')
 * const url = new URL('http://example.com')
 * const webSocket = await client.services.httpClient.connect(peerId, url, {
 *   signal: AbortSignal.timeout(10_000)
 * })
 *
 * webSocket.addEventListener('message', (evt) => {
 *   console.info(response.data)
 *   // <Uint8Array>
 * })
 * ```
 *
 * @example Using a http.Agent to make a request with node:http
 *
 * This example only works in Node.js-compatible environments.
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpClient } from '@libp2p/http'
 * import { peerIdFromString } from '@libp2p/peer-id'
 * import * as http from 'node:http'
 *
 * const client = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpClient: httpClient()
 *   }
 * })
 *
 * const peerId = peerIdFromString('12DKoo')
 * const agent = client.services.httpClient.agent(peerId)
 *
 * const req = http.request({ host: 'example.com', agent }, (res) => {
 *   let result = ''
 *
 *   res.setEncoding('utf8')
 *   res.on('data', (chunk) => {
 *     result += chunk
 *   })
 *   res.on('end', () => {
 *     console.info(result)
 *     // Hello world!
 *   })
 * })
 *
 * req.end()
 * ```
 *
 * @example Using a Dispatcher to make a request with undici
 *
 * This example only works in Node.js-compatible environments.
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpClient } from '@libp2p/http'
 * import { peerIdFromString } from '@libp2p/peer-id'
 * import { fetch } from 'undici'
 *
 * const client = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpClient: httpClient()
 *   }
 * })
 *
 * const peerId = peerIdFromString('12DKoo')
 * const url = new URL('http://example.com')
 *
 * const dispatcher = client.services.httpClient.dispatcher(peerId)
 * const response = await fetch(url, {
 *   dispatcher,
 *   signal: AbortSignal.timeout(10_000)
 * })
 *
 * console.info('Response:', response.status)
 * // Response: 200
 *
 * console.info(await response.text())
 * // Hello world!
 * ```
 *
 * # Browsers
 *
 * Making requests to servers is all good and well, but what if you could also
 * run a web or WebSocket server in a browser?
 *
 * @example A HTTP server running in a browser
 *
 * Once configured you can make requests to this server in the same was as the
 * fetch example near the top of this README.
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpServer, createServer } from '@libp2p/http'
 *
 * const server = createServer((req, res) => {
 *   req.end('Hello world!')
 * })
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpServer: httpServer({ server })
 *   }
 * })
 * ```
 *
 * @example A WebSocket server running in a browser
 *
 * Once configured you can make requests to this server in the same was as the
 * WebSocket example near the top of this README.
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { httpServer, createServer, createWebSocketServer } from '@libp2p/http'
 *
 * const wss = createWebSocketServer()
 * wss.addEventListener('connection', (evt) => {
 *   const ws = evt.webSocket
 *
 *   ws.on('message', (data) => {
 *     ws.send(data)
 *   })
 * })
 *
 * const server = createServer((req, res) => {
 *   req.end('Hello world!')
 * })
 *
 * server.addListener('upgrade', (request, socket, head) => {
 *   wss.handleUpgrade(request, socket, head, (ws) => {
 *     wss.emit('connection', ws, request)
 *   })
 * })
 *
 * const listener = await createLibp2p({
 *   // ...other options
 *   services: {
 *     httpServer: httpServer({ server })
 *   }
 * })
 * ```
 */

import { HTTP as HTTPClass } from './http.js'
import type { HTTPComponents } from './http.js'
import type { ProtocolMap } from './well-known-handler.js'
import type { AbortOptions, Connection, PeerId, Stream } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Agent, AgentOptions } from 'node:http'
import type { Uint8ArrayList } from 'uint8arraylist'
import type { Dispatcher, Agent as UnidiciAgent } from 'undici'

export { WELL_KNOWN_PROTOCOLS } from './constants.js'

export interface WebSocketInit extends AbortOptions {
  /**
   * The maximum message size to be sent or received over the socket in bytes
   *
   * @default 10_485_760
   */
  maxMessageSize?: number

  /**
   * Headers to send with the initial upgrade request
   */
  headers?: HeadersInit
}

export interface HTTPRequestHandler {
  (req: Request): Promise<Response>
}

export interface WebSocketHandler {
  (ws: WebSocket): void
}

/**
 * HTTP service interface
 */
export interface HTTP {
  /**
   * Make a request in a similar way to globalThis.fetch.
   *
   * If the passed `resource` is a string, if it starts with a `/` character it
   * will be interpreted as a Multiaddr, otherwise it will be interpreted as a
   * URL.
   *
   * URLs can start with the `multiaddr:` scheme if the global URL class in the
   * runtime environment supports it.
   */
  fetch(resource: string | URL | Multiaddr | Multiaddr[], init?: RequestInit): Promise<Response>

  /**
   * Open a WebSocket connection to an HTTP server over libp2p.
   *
   * If the passed `resource` starts with a `/` character, it will be
   * interpreted as a Multiaddr, otherwise it will be interpreted as a URL.
   *
   * URLs can start with the `multiaddr:` scheme if the global URL class in the
   * runtime environment supports it.
   */
  connect (resource: string | URL | Multiaddr | Multiaddr[], protocols?: string[], init?: WebSocketInit): WebSocket

  /**
   * Get a libp2p-enabled Agent for use with node's `http` module. This method
   * will throw when not running under Node.js or Electron.
   *
   * All requests using this Agent will be sent to the peer reachable by the
   * peer ID or multiaddr(s) passed as the first argument.
   */
  agent (peer: PeerId | Multiaddr | Multiaddr[], options?: AgentOptions): Agent

  /**
   * Get a libp2p-enabled Dispatcher for use with the `undici` module. This
   * method will throw when not running under Node.js or Electron.
   *
   * All requests using this Agent will be sent to the peer reachable by the
   * peer ID or multiaddr(s) passed as the first argument.
   */
  dispatcher (peer: PeerId | Multiaddr | Multiaddr[], options?: UnidiciAgent.Options): Dispatcher

  /**
   * Uses the peer's .well-known endpoint to find where it hosts a given
   * protocol.
   *
   * Throws an error if the peer does not serve the protocol.
   */
  getProtocolPath (peer: PeerId | Multiaddr | Multiaddr[], protocol: string, options?: AbortOptions): Promise<string>

  /**
   * Get the .well-known protocols for a peer
   */
  getSupportedProtocols (peer: PeerId | Multiaddr | Multiaddr[], options?: AbortOptions): Promise<ProtocolMap>

  /**
   * Register a listener for a HTTP protocol
   */
  handleHTTPProtocol (protocol: string, handler: HTTPRequestHandler, path?: string): void

  /**
   * Register a listener for a WebSocket protocol
   */
  handleWebSocketProtocol (protocol: string, handler: WebSocketHandler, path?: string): void

  /**
   * Remove a listener for a HTTP protocol
   */
  unhandleHTTPProtocol (protocol: string): void

  /**
   * Remove a listener for a WebSocket protocol
   */
  unhandleWebSocketProtocol (protocol: string): void

  /**
   * Return the protocol->path mappings supported by this server
   */
  getProtocolMap (): ProtocolMap

  /**
   * Returns true if there is a handler registered for the incoming Request or
   * WebSocket
   */
  canHandleHTTP (req: { url?: string }): boolean

  /**
   * Returns true if there is a handler registered for the incoming Request or
   * WebSocket
   */
  canHandleWebSocket (req: { url?: string }): boolean

  /**
   * Handle an incoming HTTP request
   */
  handleHTTP: HTTPRequestHandler

  /**
   * Handle an incoming WebSocket
   */
  handleWebSocket: WebSocketHandler
}

/**
 * Parsed from the incoming HTTP message
 */
export interface HeaderInfo {
  versionMajor: number
  versionMinor: number
  headers: Headers
  method: string
  url: string
  statusCode: number
  statusMessage: string
  upgrade: boolean
  shouldKeepAlive: boolean
  raw: Uint8ArrayList
}

export interface Endpoint {
  /**
   * Accept an incoming request. The headers have already been parsed, the
   * stream/connection should be transformed into whatever format the HTTP
   * server requires
   */
  inject (info: HeaderInfo, stream: Stream, connection: Connection): Promise<void>
}

/**
 * Options to configure the HTTP service.
 *
 * Only required if you want to specify a custom fetch implementation or used to
 * provide one if your environment does not have a global fetch.
 */
export interface HTTPInit {
  /**
   * A server that will receive incoming requests
   */
  server?: Endpoint
}

/**
 * Create an HTTP service that provides a `fetch` implementation and a way to
 * register custom HTTP handlers.
 */
export function http (init: HTTPInit = {}): (components: HTTPComponents) => HTTP {
  return (components) => new HTTPClass(components, init)
}
