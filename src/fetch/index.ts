/* eslint-disable max-depth */
/* eslint-disable complexity */

import { HTTPParser } from '@achingbrain/http-parser-js'
import { multiaddr, protocols } from '@multiformats/multiaddr'
import { multiaddrToUri } from '@multiformats/multiaddr-to-uri'
import defer from 'p-defer'
import { type Uint8ArrayList } from 'uint8arraylist'

interface Fetch { (req: Request): Promise<Response> }

const METHODS = [
  'DELETE',
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'COPY',
  'LOCK',
  'MKCOL',
  'MOVE',
  'PROPFIND',
  'PROPPATCH',
  'SEARCH',
  'UNLOCK',
  'BIND',
  'REBIND',
  'UNBIND',
  'ACL',
  'REPORT',
  'MKACTIVITY',
  'CHECKOUT',
  'MERGE',
  'M-SEARCH',
  'NOTIFY',
  'SUBSCRIBE',
  'UNSUBSCRIBE',
  'PATCH',
  'PURGE',
  'MKCALENDAR',
  'LINK',
  'UNLINK'
]

function getStringMethod (method: number): string {
  return METHODS[method] ?? 'UNKNOWN'
}

interface Duplex<TSource, TSink = TSource, RSink = Promise<void>> {
  source: AsyncIterable<TSource> | Iterable<TSource>
  sink(source: AsyncIterable<TSink> | Iterable<TSink>): RSink
}

let ranDetectionForBrokenReqBody = false
let brokenRequestBody = false

/**
 * Detects if the request body can not be a ReadableStream and should be read in
 * full before returning the request This is only an issue in the current version of Firefox.
 *
 * @returns true if the request body can not be a ReadableStream and should be read in full before returning the request
 */
async function detectBrokenRequestBody (): Promise<boolean> {
  if (ranDetectionForBrokenReqBody) {
    return brokenRequestBody
  }
  ranDetectionForBrokenReqBody = true
  const rs = new ReadableStream({
    start (controller) {
      controller.enqueue(new Uint8Array([0]))
      controller.close()
    }
  })

  const req = new Request('https://example.com', {
    method: 'POST',
    body: rs,
    // @ts-expect-error this is required by NodeJS despite being the only reasonable option https://fetch.spec.whatwg.org/#requestinit
    duplex: 'half'
  })

  const ab = await req.arrayBuffer()
  brokenRequestBody = ab.byteLength !== 1
  return brokenRequestBody
}

/**
 * Create a fetch function that can be used to fetch requests via a duplex stream
 *
 * @returns a function that can be used to fetch requests via a duplex stream
 */
export function fetchViaDuplex (s: Duplex<Uint8Array | Uint8ArrayList>): Fetch {
  return async (req) => {
    await writeRequestToDuplex(s, req)
    const [respP] = readHTTPMsg(false, s)
    const resp = await respP
    if (!(resp instanceof Response)) {
      throw new Error('Expected a response')
    }
    return resp
  }
}

/**
 * A function that can be used to handle HTTP requests
 */
export interface HTTPHandler { (req: Request): Promise<Response> }

/**
 *
 * @param s - Duplex where the request will be read from and the response will be written to
 * @param h - HTTP handler that will be called with the request
 */
export async function handleRequestViaDuplex (s: Duplex<Uint8Array | Uint8ArrayList>, h: HTTPHandler): Promise<void> {
  const [reqP] = readHTTPMsg(true, s)
  const req = await reqP
  if (!(req instanceof Request)) {
    throw new Error('Expected a request')
  }

  const resp = await h(req)
  await writeResponseToDuplex(s, resp)
}

/**
 * Exported for testing.
 *
 * @param expectRequest - is this a Request or a Response
 * @param r - where to read from
 * @returns two promises. The first is the parsed Request or Response. The second is a promise that resolves when the parsing is done.
 */
export function readHTTPMsg (expectRequest: boolean, r: Duplex<Uint8Array | Uint8ArrayList>): [Promise<Request | Response>, Promise<void>] {
  const msgPromise = defer<Request | Response>()

  return [
    msgPromise.promise,
    (async () => {
      const body = new TransformStream()
      const writer = body.writable.getWriter()
      let messageComplete = false
      let fulfilledMsgPromise = false

      const parser = new HTTPParser(expectRequest ? 'REQUEST' : 'RESPONSE')
      parser[HTTPParser.kOnHeadersComplete] = (info) => {
        fulfilledMsgPromise = true

        // Handle the headers
        const headers = new Headers()

        for (let i = 0; i < info.headers.length; i += 2) {
          headers.set(info.headers[i], info.headers[i + 1])
        }

        let reqBody: ReadableStream | null = body.readable

        // Headers are parsed. We can return the response
        try {
          if (expectRequest) {
            if (getStringMethod(info.method) === 'GET') {
              reqBody = null
            }

            const urlWithHost = `https://${headers.get('Host') ?? 'unknown_host._libp2p'}${info.url}`
            detectBrokenRequestBody().then(async (broken) => {
              let req: Request
              if (!broken) {
                req = new Request(urlWithHost, {
                  method: getStringMethod(info.method),
                  body: reqBody,
                  headers,
                  // @ts-expect-error this is required by NodeJS despite being the only reasonable option https://fetch.spec.whatwg.org/#requestinit
                  duplex: 'half'
                })
              } else {
                if (reqBody === null) {
                  req = new Request(urlWithHost, {
                    method: getStringMethod(info.method),
                    headers
                  })
                } else {
                  // Unfortunate workaround for a bug in Firefox's Request implementation.
                  // They don't support ReadableStream bodies, so we need to read the whole body.
                  const rdr = reqBody.getReader()
                  const parts = []
                  while (true) {
                    const { done, value } = await rdr.read()
                    if (done) {
                      break
                    }
                    if (value !== undefined) {
                      parts.push(value)
                    }
                  }
                  const totalSize = parts.reduce((acc, part) => acc + part.byteLength, 0)
                  const body = new Uint8Array(totalSize)
                  for (let i = 0, offset = 0; i < parts.length; i++) {
                    body.set(parts[i], offset)
                    offset += parts[i].byteLength
                  }
                  req = new Request(urlWithHost, {
                    method: getStringMethod(info.method),
                    body,
                    headers
                  })
                }
              }
              msgPromise.resolve(req)
              fulfilledMsgPromise = true
            }).catch(err => {
              msgPromise.reject(err)
            })
          } else {
            let respBody: ReadableStream<Uint8Array> | null = body.readable
            if (info.statusCode === 204) {
              respBody = null
            }
            const resp = new Response(respBody, {
              headers,
              status: info.statusCode,
              statusText: info.statusMessage
            })
            msgPromise.resolve(resp)
            fulfilledMsgPromise = true
          }
        } catch (error) {
          msgPromise.reject(error)
        }
      }
      parser[HTTPParser.kOnBody] = (buf) => {
        writer.write(buf)
          .catch((err: Error) => {
            msgPromise.reject(err)
          })
      }
      parser[HTTPParser.kOnMessageComplete] = () => {
        messageComplete = true
        writer.close()
          .catch((err: Error) => {
            msgPromise.reject(err)
          })
      }

      // Consume data
      for await (const chunks of r.source) {
        const chunk = chunks.subarray()
        parser.execute(chunk)
      }

      parser.finish()

      if (!messageComplete) {
        await writer.abort(new Error('Incomplete HTTP message'))

        if (!fulfilledMsgPromise) {
          msgPromise.reject(new Error('Incomplete HTTP message'))
        }
      }
    })()
  ]
}

const multiaddrURIPrefix = 'multiaddr:'
const CRLF = '\r\n'
const encodedCRLF = new TextEncoder().encode(CRLF)
const encodedFinalChunk = new TextEncoder().encode(`0${CRLF}${CRLF}`)
async function writeRequestToDuplex (s: Duplex<unknown, Uint8Array>, request: Request): Promise<void> {
  const method = request.method

  let reqUrl = request.url
  let path = ''
  let urlHost = ''
  if (reqUrl.startsWith(multiaddrURIPrefix)) {
    reqUrl = reqUrl.substring(multiaddrURIPrefix.length)
    const ma = multiaddr(reqUrl)
    // Find the http-path component
    const [, httpPathVal] = ma.stringTuples().find(([code, value]) =>
      code === protocols('http-path').code

    ) ?? ['', '']
    path = decodeURIComponent(httpPathVal ?? '')

    try {
      const maWithoutPath = ma.decapsulateCode(protocols('http-path').code)
      const url = new URL(multiaddrToUri(maWithoutPath))
      urlHost = url.host
    } catch {}
  } else {
    const url = new URL(reqUrl)
    urlHost = url.host
    path = (url.pathname ?? '') + (url.search ?? '')
  }
  const headers = request.headers

  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  let httpRequest = `${method} ${path} HTTP/1.1${CRLF}`

  // Add Host header if not present
  if (!headers.has('Host') && urlHost !== '') {
    httpRequest += `Host: ${urlHost}${CRLF}`
  }
  // Add connection close
  if (!headers.has('Connection')) {
    httpRequest += `Connection: close${CRLF}`
  }

  headers.forEach((value, name) => {
    httpRequest += `${name}: ${value}${CRLF}`
  })

  let reqBody = request.body
  if (request.body === undefined && typeof request.arrayBuffer === 'function') {
    const body = await request.arrayBuffer()
    if (body.byteLength > 0) {
      reqBody = new ReadableStream<Uint8Array>({
        start (controller) {
          controller.enqueue(new Uint8Array(body))
          controller.close()
        }
      })
    } else {
      reqBody = null
    }
  }

  const requestIncludesContentAndNeedsContentLength = reqBody !== null && !headers.has('Content-Length') && (method === 'POST' || method === 'PUT' || method === 'PATCH')

  if (requestIncludesContentAndNeedsContentLength) {
    // If we don't have the content length, we need to use chunked encoding
    httpRequest += `Transfer-Encoding: chunked${CRLF}`
  }
  httpRequest += CRLF

  void s.sink((async function * () {
    const httpRequestBuffer = new TextEncoder().encode(httpRequest)
    yield httpRequestBuffer

    if (reqBody === null || reqBody === undefined) {
      return
    }

    const reader = reqBody.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        // If the stream is done, break the loop
        if (done) {
          if (requestIncludesContentAndNeedsContentLength) {
            yield encodedFinalChunk
          }
          break
        }

        // add the chunk length
        if (requestIncludesContentAndNeedsContentLength) {
          const chunkLength = value.byteLength.toString(16)
          const chunkLengthBuffer = new TextEncoder().encode(`${chunkLength}${CRLF}`)
          yield chunkLengthBuffer
        }

        yield value

        if (requestIncludesContentAndNeedsContentLength) {
          yield encodedCRLF
        }
      }
    } finally {
      reader.releaseLock()
    }
  })())
}

async function writeResponseToDuplex (s: Duplex<unknown, Uint8Array>, resp: Response): Promise<void> {
  await s.sink((async function * () {
    const textEncoder = new TextEncoder()
    const status = resp.status
    const reason = resp.statusText
    const headers = resp.headers

    let httpRequest = `HTTP/1.1 ${status} ${reason}${CRLF}`

    // Add connection close
    if (!headers.has('Connection')) {
      httpRequest += `Connection: close${CRLF}`
    }

    headers.forEach((value, name) => {
      httpRequest += `${name}: ${value}${CRLF}`
    })
    httpRequest += CRLF

    yield textEncoder.encode(httpRequest)

    if (resp.body !== null && resp.body !== undefined) {
      const reader = resp.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        yield value
      }
    }
  })())
}
