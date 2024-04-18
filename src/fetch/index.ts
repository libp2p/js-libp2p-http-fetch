/* eslint-disable max-depth */
/* eslint-disable complexity */

import { type Uint8ArrayList, isUint8ArrayList } from 'uint8arraylist'
interface Fetch { (req: Request): Promise<Response> }

interface Duplex<TSource, TSink = TSource, RSink = Promise<void>> {
  source: AsyncIterable<TSource> | Iterable<TSource>
  sink(source: AsyncIterable<TSink> | Iterable<TSink>): RSink
}

export function fetchViaDuplex (s: Duplex<Uint8Array | Uint8ArrayList>): Fetch {
  return async (req) => {
    await writeRequestToDuplex(s, req)
    const stream = new ReadableStream<Uint8Array>({
      async start (controller) {
        try {
          for await (const chunk of s.source) {
            if (isUint8ArrayList(chunk)) {
              for (const c of chunk) {
                controller.enqueue(c)
              }
            } else {
              controller.enqueue(chunk)
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    const h = new HttpParser()
    const r = await h.parse(stream)
    return new Response((h.status === 204 || h.status === 205 || h.status === 304) ? null : r, {
      status: h.status,
      statusText: h.statusText,
      headers: h.headers
    })
  }
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

  headers.forEach((value, name) => {
    httpRequest += `${name}: ${value}${CRLF}`
  })

  const requestIncludesAndNeedsContentLength = headers.has('Content-Length') && (method === 'POST' || method === 'PUT' || method === 'PATCH')

  if (!requestIncludesAndNeedsContentLength && request.body !== null) {
    // If we don't have the content length, we need to use chunked encoding
    httpRequest += `Transfer-Encoding: chunked${CRLF}`
  }

  httpRequest += CRLF

  void s.sink((async function * () {
    const httpRequestBuffer = new TextEncoder().encode(httpRequest)
    yield httpRequestBuffer

    if (request.body === null) {
      return
    }

    const reader = request.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        // If the stream is done, break the loop
        if (done) {
          yield encodedFinalChunk
          break
        }

        // add the chunk length
        if (!requestIncludesAndNeedsContentLength) {
          const chunkLength = value.byteLength.toString(16)
          const chunkLengthBuffer = new TextEncoder().encode(`${chunkLength}${CRLF}`)
          yield chunkLengthBuffer
        }

        yield value

        if (!requestIncludesAndNeedsContentLength) {
          yield encodedCRLF
        }
      }
    } finally {
      reader.releaseLock()
    }
  })())
}

enum DecodingState {
  readingSize,
  readingBody,
  readingCRLF,
}

class MaybeChunkedDecoder extends TransformStream<Uint8Array, Uint8Array> {
  private isChunked = false
  private remaining = 0
  private state: DecodingState = DecodingState.readingSize
  private chunkSizeBuffer = ''
  private readonly decoder = new TextDecoder()
  private readonly encoder = new TextEncoder()

  setIsChunked (): void {
    this.isChunked = true
  }

  constructor () {
    super({
      transform: (inputChunk, controller) => {
        if (!this.isChunked) {
          controller.enqueue(inputChunk)
          return
        }

        let inputOffset = 0

        while (inputOffset < inputChunk.length) {
          if (this.state === DecodingState.readingSize) {
            const lineEnd = inputChunk.indexOf(0x0a, inputOffset) // Find LF

            if (lineEnd === -1) {
              this.chunkSizeBuffer += this.decoder.decode(inputChunk.subarray(inputOffset), {
                stream: true
              })
              break
            }

            this.chunkSizeBuffer += this.decoder.decode(inputChunk.subarray(inputOffset, lineEnd), {
              stream: true
            })
            this.remaining = parseInt(this.chunkSizeBuffer.trim(), 16)
            this.chunkSizeBuffer = ''
            inputOffset = lineEnd + 1

            if (this.remaining === 0) {
              break
            }

            this.state = DecodingState.readingBody
          } else if (this.state === DecodingState.readingBody) {
            const bytesToRead = Math.min(this.remaining, inputChunk.length - inputOffset)
            const bytesRead = inputChunk.subarray(inputOffset, inputOffset + bytesToRead)
            controller.enqueue(bytesRead)
            inputOffset += bytesToRead
            this.remaining -= bytesToRead

            if (this.remaining === 0) {
              this.state = DecodingState.readingCRLF
            }
          } else if (this.state === DecodingState.readingCRLF) {
            const lineEnd = inputChunk.indexOf(0x0a, inputOffset) // Find LF
            if (lineEnd === -1) {
              this.chunkSizeBuffer += this.decoder.decode(inputChunk.subarray(inputOffset), {
                stream: true
              })
              break
            }

            this.chunkSizeBuffer += this.decoder.decode(inputChunk.subarray(inputOffset, lineEnd), {
              stream: true
            })
            inputOffset = lineEnd + 1
            this.state = DecodingState.readingSize
          }
        }
      },

      flush: (controller) => {
        if (this.remaining > 0) {
          controller.enqueue(this.encoder.encode(this.chunkSizeBuffer))
        }
      }
    })
  }
}

class HttpParser {
  headers: Headers = new Headers()
  status: number = 0
  statusText: string = ''

  private static parseHeaders (lines: string[]): Headers {
    const headers = new Headers()
    for (const line of lines) {
      const [name] = line.split(': ', 1)
      headers.set(name.toLowerCase(), line.substring(name.length + 2))
    }
    return headers
  }

  public async parse (stream: ReadableStream): Promise<ReadableStream<Uint8Array>> {
    const t = this
    const maybeChunkedDecoder = new MaybeChunkedDecoder()
    let headersParsed = false
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()

    let headerText = ''

    return new Promise((resolve, reject) => {
      stream
        .pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            async transform (chunk, controller) {
              if (!headersParsed) {
                try {
                  const chunkText = new TextDecoder().decode(chunk, { stream: true })
                  headerText += chunkText
                  const headerEndIndex = headerText.indexOf('\r\n\r\n')
                  const prevHeaderTextLength = headerText.length - chunkText.length
                  const bodyStartIndexRelativeToChunk = (headerEndIndex + 4) - prevHeaderTextLength

                  if (headerEndIndex >= 0) {
                    const headerLines = headerText.slice(0, headerEndIndex).split('\r\n')
                    const [version, statusCode] = headerLines[0].split(' ')
                    t.status = parseInt(statusCode, 10)
                    t.headers = HttpParser.parseHeaders(headerLines.slice(1))
                    t.statusText = headerLines[0].substring(version.length + statusCode.length + 2)

                    if (t.headers.get('transfer-encoding') === 'chunked') {
                      maybeChunkedDecoder.setIsChunked()
                    }

                    headersParsed = true
                    resolve(readable)

                    const bodyChunk = chunk.subarray(bodyStartIndexRelativeToChunk)

                    if (bodyChunk.byteLength > 0) {
                      controller.enqueue(bodyChunk)
                    }
                  } else {
                    // Do nothing, we need more data
                  }
                } catch (err) {
                  reject(err)
                }
              } else {
                controller.enqueue(chunk)
              }
            }
          })
        )
        .pipeThrough(maybeChunkedDecoder)
        .pipeTo(writable)
        .then(() => {
          if (!headersParsed) {
            reject(new Error('No headers parsed'))
          }
        })
        .catch((err) => {
          if (!headersParsed) {
            reject(err)
          }
          // eslint-disable-next-line no-console
          console.warn('Error parsing HTTP response:', err)
        })
    })
  }
}
