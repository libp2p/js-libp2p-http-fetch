/* eslint-disable max-depth */
/* eslint-disable complexity */

// @ts-expect-error missing types
import { milo } from '@perseveranza-pets/milo/index-with-wasm.js'
import defer from 'p-defer'
import { Uint8ArrayList, isUint8ArrayList } from 'uint8arraylist'
interface Fetch { (req: Request): Promise<Response> }

interface Duplex<TSource, TSink = TSource, RSink = Promise<void>> {
  source: AsyncIterable<TSource> | Iterable<TSource>
  sink(source: AsyncIterable<TSink> | Iterable<TSink>): RSink
}

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

export interface HTTPHandler { (req: Request): Promise<Response> }

export async function handleRequestViaDuplex (s: Duplex<Uint8Array | Uint8ArrayList>, h: HTTPHandler): Promise<void> {
  const [reqP] = readHTTPMsg(true, s)
  const req = await reqP
  if (!(req instanceof Request)) {
    throw new Error('Expected a request')
  }

  const resp = await h(req)
  await writeResponseToDuplex(s, resp)
}

const BUFFER_SIZE = 16 << 10

export function readHTTPMsg (expectRequest: boolean, r: Duplex<Uint8Array | Uint8ArrayList>): [Promise<Request | Response>, Promise<void>] {
  const msgPromise = defer<Request | Response>()

  return [
    msgPromise.promise,
    (async () => {
      const textDecoder = new TextDecoder()
      const ptr = milo.alloc(BUFFER_SIZE)

      const parser = milo.create()
      // Simplifies implementation at the cost of storing data twice
      milo.setManageUnconsumed(parser, true)

      const bodyStreamControllerPromise = defer <ReadableStreamController<Uint8Array>>()
      const body = new ReadableStream<Uint8Array>({
        async start (controller) {
          bodyStreamControllerPromise.resolve(controller)
        }
      })
      const bodyStreamController = await bodyStreamControllerPromise.promise

      // Handle start line

      // Response
      let status = ''
      let reason = ''
      let fulfilledMsgPromise = false

      // Requests
      let url = ''
      let method = ''
      milo.setOnStatus(parser, (_: unknown, from: number, size: number) => {
        status = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
      })
      milo.setOnReason(parser, (_: unknown, from: number, size: number) => {
        reason = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
      })
      milo.setOnUrl(parser, (_: unknown, from: number, size: number) => {
        url = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
      })
      milo.setOnMethod(parser, (_: unknown, from: number, size: number) => {
        method = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
      })

      milo.setOnRequest(parser, () => {
        if (!expectRequest) {
          msgPromise.reject(new Error('Received request instead of response'))
          fulfilledMsgPromise = true
        }
      })
      milo.setOnResponse(parser, () => {
        if (expectRequest) {
          msgPromise.reject(new Error('Received response instead of request'))
          fulfilledMsgPromise = true
        }
      })

      // Handle the headers
      const headers = new Headers()
      let lastHeaderName: string = ''

      milo.setOnHeaderName(parser, (_: unknown, from: number, size: number) => {
        lastHeaderName = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
      })
      milo.setOnHeaderValue(parser, (_: unknown, from: number, size: number) => {
        const headerVal = textDecoder.decode(unconsumedChunks.subarray(from, from + size))
        headers.set(lastHeaderName, headerVal)
      })
      milo.setOnHeaders(parser, (_: unknown, from: number, size: number) => {
        // Headers are parsed. We can return the response
        try {
          if (expectRequest) {
            let reqBody: ReadableStream<Uint8Array> | null = body
            if (method === 'GET') {
              reqBody = null
            }

            const urlWithHost = `https://${headers.get('Host') ?? ''}${url}`
            const req = new Request(urlWithHost, {
              method,
              body: reqBody,
              headers
            })
            msgPromise.resolve(req)
            fulfilledMsgPromise = true
          } else {
            let respBody: ReadableStream<Uint8Array> | null = body
            if (status === '204') {
              respBody = null
            }
            const resp = new Response(respBody, {
              headers,
              status: parseInt(status),
              statusText: reason
            })
            msgPromise.resolve(resp)
            fulfilledMsgPromise = true
          }
        } catch (error) {
          msgPromise.reject(error)
        }
      })

      // Handle the body
      milo.setOnData(parser, (_: unknown, from: number, size: number) => {
        const c: Uint8Array = unconsumedChunks.subarray(from, from + size)
        // @ts-expect-error Unclear why this fails. TODO debug
        bodyStreamController.enqueue(c)
      })
      // milo.setOnBody(parser, () => {})
      milo.setOnError(parser, () => {
        bodyStreamController.error(new Error('Error parsing HTTP message'))
      })

      let messageComplete = false
      milo.setOnMessageComplete(parser, () => {
        bodyStreamController.close()
        messageComplete = true
      })

      // Consume data
      const unconsumedChunks = new Uint8ArrayList()
      for await (let chunks of r.source) {
        if (!isUint8ArrayList(chunks)) {
          chunks = new Uint8ArrayList(chunks)
        }
        for (const chunk of chunks) {
          unconsumedChunks.append(chunk)
          const buffer = new Uint8Array(milo.memory.buffer, ptr, BUFFER_SIZE)
          buffer.set(chunk, 0)
          const consumed = milo.parse(parser, ptr, chunk.length)
          unconsumedChunks.consume(consumed)
        }
      }
      milo.finish(parser)

      if (!messageComplete) {
        bodyStreamController.error(new Error('Incomplete HTTP message'))
        if (!fulfilledMsgPromise) {
          msgPromise.reject(new Error('Incomplete HTTP message'))
        }
      }

      milo.destroy(parser)
      milo.dealloc(ptr, BUFFER_SIZE)
    })()
  ]
}

const CRLF = '\r\n'
const encodedCRLF = new TextEncoder().encode(CRLF)
const encodedFinalChunk = new TextEncoder().encode(`0${CRLF}${CRLF}`)
async function writeRequestToDuplex (s: Duplex<unknown, Uint8Array>, request: Request): Promise<void> {
  const method = request.method
  const url = new URL(request.url)
  const headers = request.headers
  const path = url.pathname
  const query = url.search

  let httpRequest = `${method} ${path}${query} HTTP/1.1${CRLF}`

  // Add Host header if not present
  if (!headers.has('Host')) {
    httpRequest += `Host: ${url.host}${CRLF}`
  }
  // Add connection close
  if (!headers.has('Connection')) {
    httpRequest += `Connection: close${CRLF}`
  }

  headers.forEach((value, name) => {
    httpRequest += `${name}: ${value}${CRLF}`
  })

  const requestIncludesContentAndNeedsContentLength = headers.has('Content-Length') && (method === 'POST' || method === 'PUT' || method === 'PATCH')

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

  if (!requestIncludesContentAndNeedsContentLength && reqBody !== null) {
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
          yield encodedFinalChunk
          break
        }

        // add the chunk length
        if (!requestIncludesContentAndNeedsContentLength) {
          const chunkLength = value.byteLength.toString(16)
          const chunkLengthBuffer = new TextEncoder().encode(`${chunkLength}${CRLF}`)
          yield chunkLengthBuffer
        }

        yield value

        if (!requestIncludesContentAndNeedsContentLength) {
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
