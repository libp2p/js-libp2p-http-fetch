/**
 * @packageDocumentation
 *
 * This is an implementation of a ping protocol that runs over HTTP.
 */

import { PingHTTPService as PingHTTPServiceClass } from './ping.ts'
import type { HTTP, FetchInit, ConnectInit } from '@libp2p/http'
import type { ComponentLogger, PeerId } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'

export const HTTP_PING_PROTOCOL = '/http-ping/1'

export interface PingHTTPInit {
  /**
   * The path that the ping protocol will listen on
   */
  path?: string

  /**
   * Whether authentication is required
   *
   * @default false
   */
  requireAuth?: boolean
}

export interface PingHTTPComponents {
  http: HTTP
  logger: ComponentLogger
}

export interface PingHTTPOptions extends FetchInit {
}

export interface PingWebSocketOptions extends ConnectInit {
  /**
   * Make a request over a WebSocket instead of HTTP
   */
  webSocket: true
}

export interface PingHTTP {
  ping (peer: string | URL | PeerId | Multiaddr | Multiaddr[], options?: PingHTTPOptions | PingWebSocketOptions): Promise<number>
}

export function pingHTTP (init: PingHTTPInit = {}): (components: PingHTTPComponents) => PingHTTP {
  return (components) => new PingHTTPServiceClass(components, init)
}
