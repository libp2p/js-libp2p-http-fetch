import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'

export function readableStreamBody (stream: ReadableStream<Uint8Array>, headers: Headers): ReadableStream<Uint8Array> {
  headers.set('Content-Type', 'application/octet-stream')
  headers.set('Transfer-Encoding', 'chunked')

  const reader = stream.getReader()

  return new ReadableStream({
    async pull (controller) {
      const { done, value } = await reader.read()

      if (value != null) {
        controller.enqueue(uint8arrayFromString(`${value.byteLength}\r\n`))
        controller.enqueue(value)
        controller.enqueue(uint8arrayFromString('\r\n'))
      }

      if (done) {
        // write the final chunk
        controller.enqueue(uint8arrayFromString('0\r\n\r\n'))
        controller.close()
      }
    }
  })
}
