import { InvalidParametersError } from '@libp2p/interface'
import type { HTTPRequestHandler, WebSocketHandler } from './index.js'
import type { ComponentLogger, Logger } from '@libp2p/interface'

export type ProtocolID = string

export interface ProtocolLocation {
  path: string
}

export type ProtocolMap = Record<ProtocolID, ProtocolLocation>

export interface HTTPRegistrarComponents {
  logger: ComponentLogger
}

export class HTTPRegistrar {
  private readonly log: Logger
  private protocols: Array<{ protocol: string, path: string, http?: HTTPRequestHandler, ws?: WebSocketHandler }>

  constructor (components: HTTPRegistrarComponents) {
    this.log = components.logger.forComponent('libp2p:http:registrar')
    this.protocols = []
  }

  canHandleHTTP (req: { url?: string }): boolean {
    return this.protocols.find(p => p.path === req.url && p.http != null) != null
  }

  canHandleWebSocket (req: { url?: string }): boolean {
    return this.protocols.find(p => p.path === req.url && p.ws != null) != null
  }

  async handleHTTP (request: Request): Promise<Response> {
    const url = new URL(request.url)

    this.log('search for handler on path %s', url.pathname)

    const result = this.protocols.find(p => p.path === url.pathname)

    if (result?.http == null) {
      return new Response(null, {
        status: 404,
        statusText: 'Not Found'
      })
    }

    this.log('found for handler for HTTP protocol %s on path %s', result.protocol, url.pathname)

    return result.http(request)
  }

  handleWebSocket (ws: WebSocket): void {
    this.log('search for handler on path %s', ws.url)

    const result = this.protocols.find(p => p.path === ws.url)

    if (result?.ws == null) {
      ws.close(404, 'Not Found')
      return
    }

    this.log('found for handler for WebSocket protocol %s on path %s', result.protocol, ws.url)

    result.ws(ws)
  }

  handleHTTPProtocol (protocol: string, handler: HTTPRequestHandler, path: string = crypto.randomUUID()): void {
    for (const p of this.protocols) {
      if (p.protocol === protocol) {
        if (p.http != null) {
          throw new InvalidParametersError(`HTTP protocol handler for ${protocol} already registered`)
        }

        p.http = handler
        return
      }
    }

    if (path === '' || !path.startsWith('/')) {
      path = `/${path}`
    }

    // add handler
    this.protocols.push({
      protocol,
      path,
      http: handler
    })

    // sort by path length desc so the most specific handler is invoked first
    this.protocols.sort(({ path: a }, { path: b }) => b.length - a.length)
  }

  handleWebSocketProtocol (protocol: string, handler: WebSocketHandler, path: string = crypto.randomUUID()): void {
    for (const p of this.protocols) {
      if (p.protocol === protocol) {
        if (p.ws != null) {
          throw new InvalidParametersError(`WebSocket protocol handler for ${protocol} already registered`)
        }

        p.ws = handler
        return
      }
    }

    if (path === '' || !path.startsWith('/')) {
      path = `/${path}`
    }

    // add handler
    this.protocols.push({
      protocol,
      path,
      ws: handler
    })

    // sort by path length desc so the most specific handler is invoked first
    this.protocols.sort(({ path: a }, { path: b }) => b.length - a.length)
  }

  unhandleHTTPProtocol (protocol: string): void {
    this.protocols = this.protocols.filter(p => {
      if (p.protocol === protocol) {
        delete p.http

        return p.ws != null
      }

      return true
    })
  }

  unhandleWebSocketProtocol (protocol: string): void {
    this.protocols = this.protocols.filter(p => {
      if (p.protocol === protocol) {
        delete p.ws

        return p.http != null
      }

      return true
    })
  }

  getProtocolMap (): ProtocolMap {
    const output: ProtocolMap = {}

    for (const p of this.protocols) {
      output[p.protocol] = {
        path: p.path
      }
    }

    return output
  }
}
