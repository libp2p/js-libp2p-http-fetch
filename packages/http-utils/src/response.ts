import { STATUS_CODES } from './constants.ts'
import { getHeaders } from './index.ts'

/**
 * Extends the native Response class to be more flexible.
 *
 * - response headers - the fetch spec restricts access to certain headers that
 * we need access to `set-cookie`, `Access-Control-*`, etc, and the native
 * Response implementations remove them
 *
 * - status codes - we need to represent all possible HTTP status codes, not
 * just those allowed by the fetch spec
 */
export class Response extends globalThis.Response {
  constructor (body: BodyInit | null, init: ResponseInit = {}) {
    const headers = getHeaders(init)
    const status = init.status ?? 200

    if (status < 200 || status > 599) {
      init.status = 200
    }

    super(body, init)

    Object.defineProperties(this, {
      status: {
        value: status,
        writable: false
      },
      statusText: {
        value: STATUS_CODES[status],
        writable: false
      },
      headers: {
        value: headers,
        writable: false
      }
    })
  }
}
