import { webSocketRoute } from './websocket.ts'
import type { HTTPRoute } from '../index.ts'
import type { HTTPRegistrar } from '../registrar.ts'

export const WELL_KNOWN_PROTOCOLS_PATH = '/.well-known/libp2p/protocols'

export function wellKnownRoute (registrar: HTTPRegistrar): HTTPRoute {
  return webSocketRoute({
    path: WELL_KNOWN_PROTOCOLS_PATH,
    method: ['GET'],
    cors: true,
    handler: ws => {
      const map = JSON.stringify(registrar.getProtocolMap())
      ws.send(map)
      ws.close()
    },
    fallback: async (req) => {
      const map = JSON.stringify(registrar.getProtocolMap())
      return new Response(map, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': `${map.length}`
        }
      })
    }
  })
}
