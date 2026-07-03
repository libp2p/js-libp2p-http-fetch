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
 * in browsers to truly realize the power of the distributed web.
 *
 * In addition to URL-based addressing, it can use a libp2p PeerId and/or
 * multiaddr(s) and lets libp2p take care of the routing, thus taking advantage
 * of features like multi-routes, NAT traversal and stream multiplexing over a
 * single connection.
 *
 * Check out the [examples](https://github.com/libp2p/js-libp2p-http/tree/main/examples)
 * for how you can use this in your applications!
 */

import { HTTP as HTTPClass } from './http.ts'
import type { WEBSOCKET_HANDLER } from './constants.ts'
import type { HTTPComponents } from './http.ts'
import type { HeaderInfo, MiddlewareOptions, Middleware } from '@libp2p/http-utils'
import type { AbortOptions, Connection, PeerId, Stream } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Agent, AgentOptions, IncomingMessage } from 'node:http'
import type { Dispatcher, Agent as UndiciAgent } from 'undici'

export { WELL_KNOWN_PROTOCOLS_PATH } from './routes/well-known.ts'
export { HTTP_PROTOCOL } from './constants.ts'

/**
 * Options used to control Fetch request and the initial WebSocket upgrade
 * request
 */
export interface HTTPRequestOptions extends AbortOptions {
  /**
   * A list of request processors that can augment requests - if specified will
   * override any processors passed to the `http` service
   */
  middleware?: Array<(components: any) => Middleware>

  /**
   * The maximum number of bytes that will be parsed as response headers
   *
   * @default 81_920
   */
  maxHeaderSize?: number

  /**
   * If true, verify the server's peer id using PeerId Authentication
   *
   * @default false
   */
  authenticateServer?: boolean
}

export interface ConnectInit extends HTTPRequestOptions {
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

  /**
   * Protocols to send with the upgrade request
   */
  protocols?: string[]
}

export type FetchInit = HTTPRequestOptions & RequestInit

export interface HTTPRequestHandler {
  (req: Request): Promise<Response>
}

export interface WebSocketHandler {
  (ws: WebSocket): void
}

export type ProtocolID = string

export interface ProtocolDescriptor {
  path: string
}

export type ProtocolMap = Record<ProtocolID, ProtocolDescriptor>

export interface RequestHandlerOptions {
  /**
   * Specify a path to serve the protocol from. If omitted the protocol name
   * will be used.
   *
   * Paths can be looked up from the protocol map using `getProtocolMap()` or by
   * making a GET request to `/.well-known/libp2p/protocols`.
   */
  path?: string

  /**
   * A list of HTTP verbs this handler will respond to. If the handler is found
   * but the request method is not present a 405 will be returned.
   *
   * @default ['GET']
   */
  methods?: string[]

  /**
   * By default all handlers support CORS headers, pass `false` here to disallow
   * access to fetch requests.
   *
   * @default true
   */
  cors?: boolean
}

/**
 * Options used to define a HTTP route that can handle requests
 */
export interface RouteOptions {
  /**
   * Specify a path to serve the protocol from. If omitted the protocol name
   * will be used.
   *
   * Paths can be looked up from the protocol map using `getProtocolMap()` or by
   * making a GET request to `/.well-known/libp2p/protocols`.
   */
  path?: string

  /**
   * A list of HTTP verbs this handler will respond to. If the handler is found
   * but the request method is not present a 405 will be returned.
   *
   * @default ['GET']
   */
  method?: string | string[]

  /**
   * By default all handlers support CORS headers, pass `false` here to disallow
   * access to fetch requests.
   *
   * @default true
   */
  cors?: boolean
}

/**
 * A simple route that defines a handler function
 */
export interface HandlerRoute<H> extends RouteOptions {
  handler: H
}

/**
 * A route that requires initialization before use
 */
export interface ServiceRoute<H> extends RouteOptions {
  init(components: any): H
}

/**
 * A WebSocket route can make it's handler available for invocation with a
 * pre-upgraded WebSocket object
 */
export interface WebSocketRoute {
  [WEBSOCKET_HANDLER]?: WebSocketHandler
}

/**
 * A union of the various route types
 */
export type HTTPRoute<H = HTTPRequestHandler> = (HandlerRoute<H> | ServiceRoute<H>) & WebSocketRoute

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
  fetch(resource: string | URL | PeerId | Multiaddr | Multiaddr[], init?: FetchInit): Promise<Response>

  /**
   * Open a WebSocket connection to an HTTP server over libp2p.
   *
   * If the passed `resource` starts with a `/` character, it will be
   * interpreted as a Multiaddr, otherwise it will be interpreted as a URL.
   *
   * URLs can start with the `multiaddr:` scheme if the global URL class in the
   * runtime environment supports it.
   */
  connect (resource: string | URL | PeerId | Multiaddr | Multiaddr[], init?: ConnectInit): Promise<WebSocket>

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
  dispatcher (peer: PeerId | Multiaddr | Multiaddr[], options?: UndiciAgent.Options): Dispatcher

  /**
   * Look up the path for the protocol and invoke it with the passed arguments.
   *
   * This is similar in scope to `libp2p.dialProtocol`.
   */
  fetchProtocol(resource: string | URL | PeerId | Multiaddr | Multiaddr[], protocol: string, init?: FetchInit): Promise<Response>

  /**
   * Look up the path for the protocol and create a WebSocket connection to the
   * handler.
   *
   * This is similar in scope to `libp2p.dialProtocol`.
   */
  connectProtocol(resource: string | URL | PeerId | Multiaddr | Multiaddr[], protocol: string, init?: ConnectInit): Promise<WebSocket>

  /**
   * Register a listener for a HTTP protocol
   */
  handle (protocol: string, handler: HTTPRoute<HTTPRequestHandler>): void

  /**
   * Remove a listener for a HTTP protocol
   */
  unhandle (protocol: string): void

  /**
   * Return the protocol->path mappings supported by this server
   */
  getProtocolMap (): ProtocolMap

  /**
   * Returns true if there is a handler registered for the incoming Request or
   * WebSocket.
   *
   * Note - the `.url` property must be set on the WebSocket for this to work.
   * Not all server-side WebSocket frameworks do this out of the box so the
   * caller may have to add the property.
   */
  canHandle (req: Request | IncomingMessage | WebSocket): boolean

  /**
   * Handle an incoming HTTP request
   */
  onRequest: HTTPRequestHandler

  /**
   * Handle an incoming WebSocket
   */
  onWebSocket: WebSocketHandler
}

/**
 * A WebServer that can accept incoming libp2p streams and transform them into
 * an HTTP request that can be processed
 */
export interface WebServer {
  /**
   * Accept an incoming request. The headers have already been parsed, the
   * stream/connection should be transformed into whatever format the HTTP
   * server requires
   */
  inject (info: HeaderInfo, stream: Stream, connection: Connection): Promise<void>
}

export type { MiddlewareOptions, Middleware }

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
  server?: WebServer

  /**
   * How long in ms an auth token for a server will be valid for, defaults to
   * one hour
   *
   * @default 360_000
   */
  authTokenTTL?: number

  /**
   * A list of request processors that can augment requests. Middleware passed
   * here will be invoked on every outgoing request.
   */
  middleware?: Array<(components: any) => Middleware>

  /**
   * How often to evict stale cookies from the cache in ms.
   *
   * Nb. cookies are checked for expiry before sending, this setting just
   * prevents persisting cookies indefinitely for servers that are contacted
   * infrequently.
   *
   * @default 60_000
   */
  cookieExpiryCheckInterval?: number
}

/**
 * Create an HTTP service that provides a `fetch` implementation and a way to
 * register custom HTTP handlers.
 */
export function http (init: HTTPInit = {}): (components: HTTPComponents) => HTTP {
  return (components) => new HTTPClass(components, init)
}

export { authenticatedRoute, authenticatedWebSocketRoute } from './routes/peer-id-auth.ts'
export { webSocketRoute } from './routes/websocket.ts'
