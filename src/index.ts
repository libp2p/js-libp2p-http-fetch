/**
 * @packageDocumentation
 *
 * TODO
 *
 * @example
 *
 * ```typescript
 * import { noise } from '@chainsafe/libp2p-noise'
 * import { yamux } from '@chainsafe/libp2p-yamux'
 * import { mplex } from '@libp2p/mplex'
 * import { tcp } from '@libp2p/tcp'
 * import { createLibp2p, type Libp2p } from 'libp2p'
 * import { plaintext } from '@libp2p/plaintext'
 * import { perf, type Perf } from '@libp2p/perf'
 *
 * const ONE_MEG = 1024 * 1024
 * const UPLOAD_BYTES = ONE_MEG * 1024
 * const DOWNLOAD_BYTES = ONE_MEG * 1024
 *
 * async function createNode (): Promise<Libp2p<{ perf: Perf }>> {
 *   return createLibp2p({
 *     addresses: {
 *       listen: [
 *         '/ip4/0.0.0.0/tcp/0'
 *       ]
 *     },
 *     transports: [
 *       tcp()
 *     ],
 *     connectionEncryption: [
 *       noise(), plaintext()
 *     ],
 *     streamMuxers: [
 *       yamux(), mplex()
 *     ],
 *     services: {
 *       http: http()
 *     }
 *   })
 * }
 *
 * const libp2p1 = await createNode()
 * const libp2p2 = await createNode()
 *
 * // TODO
 *
 * await libp2p1.stop()
 * await libp2p2.stop()
 * ```
 */

import { WHATWGFetch } from './whatwg-fetch-service.js'
import type { ComponentLogger } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'
import type { Multiaddr } from '@multiformats/multiaddr'

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
