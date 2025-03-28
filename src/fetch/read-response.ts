import { HTTPParser } from '@achingbrain/http-parser-js'
import type { SendRequestInit } from './index.js'
import type { Stream } from '@libp2p/interface'
import type { ByteStream } from 'it-byte-stream'

export async function readResponse (bytes: ByteStream<Stream>, resource: URL, init: SendRequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const body = new TransformStream()
    const writer = body.writable.getWriter()
    let headersComplete = false

    const parser = new HTTPParser('RESPONSE')
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      init.log('response headers complete')
      headersComplete = true
      const headers: Array<[string, string]> = []

      for (let i = 0; i < info.headers.length; i += 2) {
        headers.push([info.headers[i], info.headers[i + 1]])
      }

      const response = new Response(body.readable, {
        status: info.statusCode,
        statusText: info.statusMessage,
        headers
      })

      resolve(response)
    }
    parser[HTTPParser.kOnBody] = (buf) => {
      init.log('response read body %d bytes', buf.byteLength)
      writer.write(buf)
        .catch((err: Error) => {
          reject(err)
        })
    }
    parser[HTTPParser.kOnMessageComplete] = () => {
      init.log('response message complete')
      writer.close()
        .catch((err: Error) => {
          reject(err)
        })

      const stream = bytes.unwrap()
      stream.close()
        .catch(err => {
          stream.abort(err)
        })
    }

    Promise.resolve()
      .then(async () => {
        let read = 0
        while (true) {
          const chunk = await bytes.read({
            signal: init.signal ?? undefined
          })

          if (chunk == null) {
            const err = parser.finish()

            if (err != null) {
              init.log('response stream ended with error - %e', err)
            } else {
              init.log('response stream ended')
            }

            if (!headersComplete) {
              reject(new Error(`Response ended before headers were received, read ${read} bytes`))
            }

            break
          }

          read += chunk.byteLength

          init.log('response stream read %d bytes', chunk.byteLength)
          parser.execute(chunk.subarray(), 0, chunk.byteLength)
        }
      })
      .catch((err: Error) => {
        reject(err)
      })
  })
}
