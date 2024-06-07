/**
 * @packageDocumentation
 *
 * {@link http} implements the WHATWG [Fetch
 * api](https://fetch.spec.whatwg.org). It can be used as a drop in replacement
 * for the browser's fetch function. It supports http, https, and multiaddr
 * URIs. Use HTTP in p2p networks.
 *
 * @example
 *
 * See the `examples/` for full examples of how to use the HTTP service.
 * ```typescript
 * import { createLibp2p } from 'libp2p'
 * import { http } from '../dist/src/index.js'
 
 * async function main () {
 * const node = await createLibp2p({
 *     // other options ...
 *     services: {
 *       http: http()
 *     }
 * })
 
 * await node.start()
 
 * // Make an http request to a libp2p peer
 * let resp = await node.services.http.fetch('multiaddr:/dns4/localhost/tcp/1234')
 * // Or a traditional HTTP request
 * resp = await node.services.http.fetch('multiaddr:/dns4/example.com/tcp/443/tls/http')
 * // And of course, you can use the fetch API as you normally would
 * resp = await node.services.http.fetch('https://example.com')
 
 * // This gives you the accessiblity of the fetch API with the flexibility of using a p2p network.
 * }
 
 * main()
 * ```
 */

import { WHATWGFetch } from './whatwg-fetch-service.js'
import type { ComponentLogger } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'
import type { Multiaddr } from '@multiformats/multiaddr'

export { WELL_KNOWN_PROTOCOLS } from './constants.js'

/**
 * HTTP service interface.
 */
export interface HTTP {
  fetch(request: string | Request, requestInit?: RequestInit): Promise<Response>
  // Uses the peer's .well-known endpoint to find where it hosts a given protocol.
  // Throws an error if the peer does not serve the protocol.
  prefixForProtocol (peer: Multiaddr, protocol: string): Promise<string>

  // handleHTTPProtocol registers a handler for the given protocol on the given path. This is incompatible with a customHTTPHandler.
  handleHTTPProtocol (protocol: string, path: string, handler: (req: Request) => Promise<Response>): void
}

/**
 *
 */
export interface HTTPWithCustomHandler {
  // Will full a request to this peer's .well-known libp2p endpoint using
  // information from the registerProtocol calls.
  serveWellKnownProtocols (req: Request): Promise<Response>
  // Inform this service of a protocol that you support and where it can be found.
  // This metadata will be served at the .well-known endpoint.
  registerProtocol(protocol: string, path: string): void
}

export interface FetchComponents {
  registrar: Registrar
  connectionManager: ConnectionManager
  logger: ComponentLogger
}

/**
 * Options to configure the HTTP service.
 *
 * Only required if you want to specify a custom fetch implementation. Or provide one if your environment does not have a global fetch.
 */
export interface HTTPInit {
  // Native Fetch implementation. Defaults to global fetch if available. If not
  // available, it will throw an error.
  fetch?(request: Request): Promise<Response>
}

export interface CustomHTTPHandlerInit {
  // Custom root HTTP handler for handling requests. If you set this you are in
  // charge of fulfilling all HTTP requests including serving the libp2p well-known
  // protocols (`.serverWellKnownProtocols` may be helpful).
  //
  // Most users should use the default handler. Which is used by calling
  // `.handleHTTPProtocol`.
  customHTTPHandler(req: Request): Promise<Response>
}

/**
 * Create an HTTP service that provides a `fetch` implementation and a way to register custom HTTP handlers.
 *
 * @param init - Options to configure the HTTP service.
 * @returns
 */
export function http (init: HTTPInit = {}): (components: FetchComponents) => HTTP {
  return (components) => new WHATWGFetch(components, init)
}

/**
 * Start an HTTP service with a custom HTTP handler that is responsible for handling all HTTP requests and routing appropriately.
 * Most users should use the `http` function and register their own protocols with `.handleHTTPProtocol`.
 *
 * @param init - Options to configure the HTTP service.
 * @returns
 */
export function httpCustomServer (init: HTTPInit & CustomHTTPHandlerInit): (components: FetchComponents) => HTTP & HTTPWithCustomHandler {
  return (components) => new WHATWGFetch(components, init)
}
