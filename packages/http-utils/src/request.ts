import { getHeaders, isWebSocketUpgrade } from './index.ts'

/**
 * Extends the native Request class to be more flexible.
 *
 * - body - normally GET requests cannot have a body, but if the request is for
 * a WebSocket upgrade, we need the body to turn into the socket
 *
 * Also firefox Web Workers remove the request body though weirdly the main
 * thread doesn't.
 *
 * - headers - the global browser request removes certain headers like
 * Authorization and Sec-WebSocket-Protocol but we need to preserve them
 */
export class Request extends globalThis.Request {
  constructor (input: RequestInfo | URL, init: RequestInit = {}) {
    const method = init.method ?? 'GET'
    const headers = getHeaders(init)
    const body = init.body

    if (isWebSocketUpgrade(method, headers)) {
      // temporarily override the method name since undici does not allow GET
      // requests with bodies
      init.method = 'UPGRADE'
    }

    super(input, init)

    Object.defineProperties(this, {
      body: {
        value: body,
        writable: false
      },
      method: {
        value: method,
        writable: false
      },
      headers: {
        value: headers,
        writable: false
      }
    })
  }
}
