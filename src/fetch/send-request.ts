import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'
import { blobBody } from './body/blob.js'
import { bytesBody } from './body/bytes.js'
import { formDataBody } from './body/form-data.js'
import { readableStreamBody } from './body/readable-stream.js'
import { stringBody } from './body/string.js'
import type { SendRequestInit } from './index.js'
import type { Stream } from '@libp2p/interface'
import type { ByteStream } from 'it-byte-stream'

export async function sendRequest (bytes: ByteStream<Stream>, url: URL, init: SendRequestInit): Promise<void> {
  const headers = new Headers(init.headers)

  const host = headers.get('host') ?? url.hostname
  headers.set('host', host)

  if (headers.get('user-agent') == null) {
    headers.set('user-agent', 'libp2p/fetch')
  }

  let content: ReadableStream<Uint8Array> | undefined

  if (init.body != null) {
    content = normalizeContent(init.body, headers)
  }

  const req = [
    `${init?.method?.toUpperCase() ?? 'GET'} ${url.pathname ?? '/'} HTTP/1.1`,
    ...writeHeaders(headers),
    '',
    ''
  ]

  await bytes.write(uint8arrayFromString(req.join('\r\n')), {
    signal: init.signal ?? undefined
  })

  if (content != null) {
    init.log('request sending body')
    await sendBody(bytes, content, init)
  }
}

async function sendBody (bytes: ByteStream<Stream>, stream: ReadableStream<Uint8Array>, init: SendRequestInit): Promise<void> {
  const reader = stream.getReader()

  while (true) {
    const { done, value } = await reader.read()

    if (value != null) {
      init.log('request send %d bytes', value.byteLength)
      await bytes.write(value, {
        signal: init.signal ?? undefined
      })
    }

    if (done) {
      init.log('request finished sending body')
      break
    }
  }
}

function normalizeContent (body: BodyInit, headers: Headers): ReadableStream {
  if (typeof body === 'string') {
    return stringBody(body, headers)
  } else if (body instanceof Blob) {
    return blobBody(body, headers)
  } else if (isBytes(body)) {
    return bytesBody(body, headers)
  } else if (body instanceof URLSearchParams) {
    return stringBody(body.toString(), headers)
  } else if (body instanceof ReadableStream) {
    return readableStreamBody(body, headers)
  } else if (body instanceof FormData) {
    return formDataBody(body, headers)
  }

  throw new Error('Unsupported body type')
}

function writeHeaders (headers: Headers): string[] {
  const output = []

  if (headers.get('Connection') == null) {
    headers.set('Connection', 'close')
  }

  for (const [key, value] of headers.entries()) {
    output.push(`${key}: ${value}`)
  }

  return output
}

function isBytes (obj?: any): obj is Uint8Array {
  if (obj == null) {
    return false
  }

  return obj.byteLength != null
}
