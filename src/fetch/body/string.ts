import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'

export function stringBody (str: string, headers: Headers): ReadableStream {
  headers.set('Content-Length', `${str.length}`)
  headers.set('Content-Type', 'text/plain; charset="UTF-8"')

  return new ReadableStream({
    start (controller) {
      controller.enqueue(uint8ArrayFromString(str))
      controller.close()
    }
  })
}
