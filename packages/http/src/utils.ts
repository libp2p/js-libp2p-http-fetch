import type { MiddlewareOptions } from './index.ts'
import type { Multiaddr } from '@multiformats/multiaddr'

export async function prepareAndSendRequest (resource: URL | Multiaddr[], opts: MiddlewareOptions, sendRequest: () => Promise<Response>): Promise<Response> {
  for (const middleware of opts.middleware) {
    await middleware.prepareRequest?.(resource, opts)
  }

  return sendRequest()
}

export async function prepareAndConnect (resource: URL | Multiaddr[], opts: MiddlewareOptions, connect: () => Promise<globalThis.WebSocket>): Promise<globalThis.WebSocket> {
  for (const middleware of opts.middleware) {
    await middleware.prepareRequest?.(resource, opts)
  }

  return connect()
}

export async function processResponse (resource: URL | Multiaddr[], opts: MiddlewareOptions, response: Response): Promise<Response> {
  for (const middleware of opts.middleware) {
    response = await middleware.processResponse?.(resource, opts, response) ?? response
  }

  return response
}
