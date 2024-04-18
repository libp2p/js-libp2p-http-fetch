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

import { WHATWGFetch } from './whatwg-fetch-service'
import type { ComponentLogger } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'

export interface HTTP {
  fetch(request: Request): Promise<Response>
}

export interface FetchComponents {
  registrar: Registrar
  connectionManager: ConnectionManager
  logger: ComponentLogger
}

export function http (init: unknown = {}): (components: FetchComponents) => HTTP {
  return (components) => new WHATWGFetch(components, init)
}
