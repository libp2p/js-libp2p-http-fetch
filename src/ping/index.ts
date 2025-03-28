// http-ping implementation
import { PingHTTPService as PingHTTPServiceClass } from './ping.js'
import type { HTTP } from '../index.js'
import type { AbortOptions, PeerId } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'

export const HTTP_PING_PROTOCOL = '/http-ping/1'

export interface PingHTTPComponents {
  http: HTTP
}

export interface PingOptions extends AbortOptions {
  /**
   * If true, make a request over a WebSocket instead of HTTP
   */
  webSocket?: true
}

export interface PingHTTP {
  ping (peer: PeerId | Multiaddr | Multiaddr[], options?: PingOptions): Promise<number>
}

export function pingHTTP (): (components: PingHTTPComponents) => PingHTTP {
  return (components) => new PingHTTPServiceClass(components)
}
