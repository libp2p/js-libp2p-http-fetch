import { HTTPParser } from '@achingbrain/http-parser-js'
import { Response } from '@libp2p/http-utils'
import { InvalidResponseError } from './errors.ts'
import type { SendRequestInit } from './index.ts'
import type { Stream } from '@libp2p/interface'

const nullBodyStatus = [101, 204, 205, 304]

export async function readResponse (stream: Stream, resource: URL, init: SendRequestInit): Promise<Response> {
  const output = Promise.withResolvers<Response>()
  const body = new TransformStream()
  const writer = body.writable.getWriter()
  let headersComplete = false

  const parser = new HTTPParser('RESPONSE')
  parser.maxHeaderSize = init.maxHeaderSize ?? HTTPParser.maxHeaderSize
  parser[HTTPParser.kOnHeadersComplete] = (info) => {
    init.log('response headers complete')
    headersComplete = true
    const headers = new Headers()

    for (let i = 0; i < info.headers.length; i += 2) {
      headers.append(info.headers[i], info.headers[i + 1])
    }

    let responseBody: BodyInit | null = body.readable

    if (nullBodyStatus.includes(info.statusCode)) {
      body.writable.close().catch(() => {})
      body.readable.cancel().catch(() => {})
      responseBody = null
    }

    const response = new Response(responseBody, {
      status: info.statusCode,
      statusText: info.statusMessage,
      headers
    })

    output.resolve(response)
  }
  parser[HTTPParser.kOnBody] = (buf) => {
    init.log('response read body %d bytes', buf.byteLength)
    writer.write(buf)
      .catch((err: Error) => {
        output.reject(err)
      })
  }
  parser[HTTPParser.kOnMessageComplete] = () => {
    init.log('response message complete')
    writer.close()
      .catch((err: Error) => {
        output.reject(err)
      })
  }

  let read = 0
  stream.addEventListener('message', ({ data }) => {
    init.log('response stream read %d bytes', data.byteLength)
    read += data.byteLength

    const result = parser.execute(data.subarray(), 0, data.byteLength)

    if (result instanceof Error) {
      stream.abort(result)
      parser.finish()
    }
  })
  stream.addEventListener('remoteCloseWrite', () => {
    if (!headersComplete) {
      output.reject(new InvalidResponseError(`Response ended before headers were received, read ${read} bytes`))
    }

    parser.finish()
  })

  return output.promise
}
