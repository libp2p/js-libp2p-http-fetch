import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'

function calculateSize (name: string, entry: FormDataEntryValue, boundary: string): number {
  const header = [
    `--${boundary}`
  ]

  let contentLength = 0
  const trailingLinebreak = '\r\n'.length

  if (typeof entry === 'string') {
    header.push(
      `Content-Disposition: form-data; name="${name}"`,
      'Content-Type: text/plain; charset="UTF-8"',
      `Content-Length: ${entry.length}`,
      ''
    )

    contentLength = entry.length + trailingLinebreak
  } else {
    header.push(
      `Content-Disposition: form-data; name="${name}"; filename="${encodeURIComponent(entry.name)}"`,
      'Content-Type: application/octet-stream',
      `Content-Length: ${entry.size}`,
      ''
    )

    contentLength = entry.size + trailingLinebreak
  }

  const buf = uint8arrayFromString(header.join('\r\n'))

  return buf.byteLength + contentLength
}

export function formDataBody (formData: FormData, headers: Headers): ReadableStream<Uint8Array> {
  const boundary = `-----------------------------${crypto.randomUUID()}`
  headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`)

  // calculate length
  let length = 0
  for (const [name, value] of formData.entries()) {
    length += calculateSize(name, value, boundary)
  }

  headers.set('Content-Length', `${length}`)

  const formDataIterator = formData.entries()
  let fileDataReader: ReadableStreamDefaultReader<Uint8Array> | undefined

  function queuePart (controller: ReadableStreamDefaultController, name: string, entry: FormDataEntryValue, boundary: string): void {
    const header = [
      `--${boundary}`
    ]

    if (typeof entry === 'string') {
      header.push(
        `Content-Disposition: form-data; name="${name}"`,
        'Content-Type: text/plain; charset="UTF-8"',
        `Content-Length: ${entry.length}`,
        '',
        entry,
        ''
      )
    } else {
      header.push(
        `Content-Disposition: form-data; name="${name}"; filename="${encodeURIComponent(entry.name)}"`,
        'Content-Type: application/octet-stream',
        `Content-Length: ${entry.size}`,
        ''
      )

      // write header this time, next time read file data
      fileDataReader = entry.stream().getReader()
    }

    controller.enqueue(uint8arrayFromString(header.join('\r\n')))
  }

  async function getNext (controller: ReadableStreamDefaultController, boundary: string): Promise<void> {
    // check if we are part way through reading a File entry
    if (fileDataReader != null) {
      const result = await fileDataReader.read()

      if (result.value != null) {
        controller.enqueue(result.value)
      }

      if (result.done) {
        controller.enqueue(uint8arrayFromString('\r\n'))
        fileDataReader = undefined
      }

      return
    }

    // read next FormData field
    const { done, value } = formDataIterator.next()

    if (value != null) {
      const [name, entry] = value

      queuePart(controller, name, entry, boundary)
    }

    if (done === true) {
      controller.close()
    }
  }

  return new ReadableStream({
    async pull (controller): Promise<void> {
      await getNext(controller, boundary)
    }
  })
}
