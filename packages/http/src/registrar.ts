import { NOT_FOUND_RESPONSE, normalizeMethod, normalizeUrl, readHeaders, responseToStream, streamToRequest } from '@libp2p/http-utils'
import { CLOSE_MESSAGES } from '@libp2p/http-websocket'
import { InvalidParametersError } from '@libp2p/interface'
import { HTTP_PROTOCOL, WEBSOCKET_HANDLER } from './constants.ts'
import { initializeRoute } from './routes/utils.ts'
import { wellKnownRoute } from './routes/well-known.ts'
import type { WebServer, HTTPRequestHandler, ProtocolMap, WebSocketHandler, HTTPRoute, HandlerRoute } from './index.ts'
import type { ComponentLogger, Connection, Logger, Stream } from '@libp2p/interface'
import type { Registrar } from '@libp2p/interface-internal'

export interface HTTPRegistrarComponents {
  logger: ComponentLogger
  registrar: Registrar
}

export interface HTTPRegistrarInit {
  server?: WebServer
}

interface ProtocolHandler {
  protocol: string
  route: Required<HandlerRoute<HTTPRequestHandler>>
}

export class HTTPRegistrar {
  private readonly log: Logger
  private readonly components: HTTPRegistrarComponents
  private protocols: ProtocolHandler[]
  private readonly endpoint?: WebServer

  constructor (components: HTTPRegistrarComponents, init: HTTPRegistrarInit = {}) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:http:registrar')
    this.protocols = []
    this.onStream = this.onStream.bind(this)
    this.endpoint = init.server
    this.handle('', wellKnownRoute(this))
  }

  async start (): Promise<void> {
    await this.components.registrar.handle(HTTP_PROTOCOL, this.onStream.bind(this))
  }

  async stop (): Promise<void> {
    await this.components.registrar.unhandle(HTTP_PROTOCOL)
  }

  private async onStream (stream: Stream, connection: Connection): Promise<void> {
    const info = await readHeaders(stream)

    if (this.canHandle(info)) {
      this.log('handling incoming request %s %s', info.method, info.url)
      const res = await this.onRequest(streamToRequest(info, stream))
      await responseToStream(res, stream)
      await stream.close()

      return
    }

    // pass request to endpoint if available
    if (this.endpoint == null) {
      this.log('cannot handle incoming request %s %s and no endpoint configured', info.method, info.url)
      stream.send(NOT_FOUND_RESPONSE)
      await stream.close()
      return
    }

    this.log('passing incoming request %s %s to endpoint', info.method, info.url)
    this.endpoint.inject(info, stream, connection)
      .catch(err => {
        this.log.error('error injecting request to endpoint - %e', err)
        stream.abort(err)
      })
  }

  canHandle (req: { url?: string }): boolean {
    const url = normalizeUrl(req).pathname

    if (this.protocols.find(p => p.route.path === url) != null) {
      this.log.trace('can handle %s', url)
      return true
    }

    this.log.trace('cannot handle %s', url)
    return false
  }

  async onRequest (request: Request): Promise<Response> {
    this.log('incoming request %s %s', request.method, request.url)

    const handler = this.findHandler(request.url)

    if (handler == null) {
      return new Response(null, {
        status: 404
      })
    }

    let response: Response

    // support OPTIONS method where endpoint does not
    if (!handler.route.method.includes(request.method)) {
      if (request.method === 'OPTIONS') {
        response = new Response(null, {
          status: 204
        })
      } else {
        response = new Response(null, {
          status: 405
        })
      }
    } else {
      response = await handler.route.handler(request)
    }

    addHeaders(response, request, handler)

    this.log('%s %s %d %s', request.method, request.url, response.status, response.statusText)

    return response
  }

  onWebSocket (ws: WebSocket): void {
    const handler = this.findHandler(ws.url)

    if (handler != null) {
      // @ts-expect-error hidden field
      const wsHandler: WebSocketHandler = handler.route[WEBSOCKET_HANDLER]

      if (wsHandler != null) {
        wsHandler(ws)
        return
      }
    }

    ws.close(CLOSE_MESSAGES.NORMAL_CLOSURE)
  }

  private findHandler (url: string): ProtocolHandler | undefined {
    const pathname = url.startsWith('/') ? url : new URL(url).pathname

    this.log('search for handler on path %s', pathname)

    const handler = this.protocols.find(p => p.route.path === pathname)

    if (handler != null) {
      this.log('found handler for HTTP protocol %s on path %s', handler.protocol, url)
    }

    return handler
  }

  handle (protocol: string, route: HTTPRoute): void {
    route.path = route.path ?? protocol

    if (this.protocols.find(p => p.protocol === protocol) != null) {
      throw new InvalidParametersError(`HTTP protocol handler for ${protocol} already registered`)
    }

    if (route.path === '' || !route.path.startsWith('/')) {
      route.path = `/${route.path}`
    }

    route.cors = route.cors ?? true
    route.method = normalizeMethod(route.method)
    route = initializeRoute(route, this.components)

    // add handler
    this.protocols.push({
      protocol,
      // @ts-expect-error optional fields are filled out above
      route
    })

    // sort by path length desc so the most specific handler is invoked first
    this.protocols.sort(({ route: { path: a } }, { route: { path: b } }) => b.length - a.length)
  }

  unhandle (protocol: string): void {
    this.protocols = this.protocols.filter(p => p.protocol === protocol)
  }

  getProtocolMap (): ProtocolMap {
    const output: ProtocolMap = {}

    for (const p of this.protocols) {
      if (p.protocol === '') {
        continue
      }

      output[p.protocol] = {
        path: p.route.path
      }
    }

    return output
  }
}

function addHeaders (response: Response, request: Request, handler: ProtocolHandler): void {
  const allow = [...new Set(['OPTIONS', ...handler.route.method])].join(', ')

  if (handler.route.cors) {
    if (request.headers.get('Access-Control-Request-Method') != null) {
      response.headers.set('access-control-allow-methods', allow)
    }

    if (request.headers.get('Access-Control-Request-Headers') != null) {
      response.headers.set('access-control-allow-headers', request.headers.get('Access-Control-Request-Headers') ?? '')
    }

    if (request.headers.get('Origin') != null) {
      response.headers.set('access-control-allow-origin', request.headers.get('Origin') ?? '')
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin#cors_and_caching
      response.headers.set('vary', 'Origin')
    }
  }

  if (request.method === 'OPTIONS') {
    response.headers.set('allow', allow)
  }
}
