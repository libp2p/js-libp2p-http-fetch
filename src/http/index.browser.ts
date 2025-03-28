import { HTTPServer } from './server.js'
import type { ServerOptions, RequestListener, IncomingMessage, ServerResponse, Server } from 'node:http'

/**
 * Implements the same interface as `createServer` from `node:http` just without
 * any node internals.
 *
 * If running in a browser, instances of `http.Server` returned by this function
 * could be passed to a web framework such as `express` or `fastify`, assuming
 * they are runnable in browsers.
 */
export function createServer<
    Request extends typeof IncomingMessage = typeof IncomingMessage,
    Response extends typeof ServerResponse<InstanceType<Request>> = typeof ServerResponse
  > (requestListener?: RequestListener<Request, Response>): Server<Request, Response>
export function createServer<
    Request extends typeof IncomingMessage = typeof IncomingMessage,
    Response extends typeof ServerResponse<InstanceType<Request>> = typeof ServerResponse
  > (options: ServerOptions<Request, Response>,
  requestListener?: RequestListener<Request, Response>): Server<Request, Response>
export function createServer<
  Request extends typeof IncomingMessage = typeof IncomingMessage,
  Response extends typeof ServerResponse<InstanceType<Request>> = typeof ServerResponse
> (options: any,
  requestListener?: any): Server<Request, Response> {
  if (typeof options === 'function') {
    requestListener = options
    options = {}
  }

  const server: Server<Request, Response> = new HTTPServer<Request, Response>(options)

  if (requestListener != null) {
    server.on('request', requestListener)
  }

  return server
}
