import { createLibp2p } from 'libp2p'
import { http } from '../../src/index.js'
import { pingHTTP, type PingHTTP } from '../../src/ping/index.js'
import { incomingMessageToRequest, writeResponse } from '../../src/servers/node.js'
import type { HTTP } from '../../src/index.js'
import type { Libp2p } from '@libp2p/interface'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface Libp2pOverHTTPHandler {
  /**
   * Returns `true` if the libp2p HTTP service will handle this request (e.g. it
   * is for protocol map published at the `/.well-known` location or there is a
   * protocol handler registered for this path).
   */
  (req: IncomingMessage, res: ServerResponse): boolean
}

export interface Libp2pOverWSHandler {
  /**
   * Returns `true` if the libp2p HTTP service will handle this request (e.g. it
   * is for protocol map published at the `/.well-known` location or there is a
   * protocol handler registered for this path).
   */
  (ws: WebSocket): boolean
}

export interface Libp2pOverHttpHandlerResults {
  http: Libp2pOverHTTPHandler
  ws: Libp2pOverWSHandler
  libp2p: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>
}

export async function getLibp2pOverHttpHandler (): Promise<Libp2pOverHttpHandlerResults> {
  const libp2p = await createLibp2p({
    services: {
      http: http(),
      pingHTTP: pingHTTP()
    },
    connectionManager: {
      inboundConnectionThreshold: Infinity
    }
  })

  const httpHandler = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (libp2p.services.http.canHandleHTTP(req)) {
      libp2p.services.http.handleHTTP(incomingMessageToRequest(req))
        .then(result => {
          writeResponse(result, res)
        })
        .catch(err => {
          res.writeHead(500, err.toString())
          res.end()
        })
      return true
    }

    return false
  }

  const wsHandler = (ws: WebSocket): boolean => {
    if (libp2p.services.http.canHandleWebSocket(ws)) {
      libp2p.services.http.handleWebSocket(ws)
      return true
    }

    return false
  }

  return {
    libp2p,
    http: httpHandler,
    ws: wsHandler
  }
}
