import { streamToSocket } from '../stream-to-socket.js'
import { readableToReadableStream } from '../utils.js'
import type { Endpoint, HeaderInfo } from '../index.js'
import type { Stream, Connection } from '@libp2p/interface'
import type { ServerResponse, IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

export interface ConnectionHandler {
  emit (event: 'connection', socket: Socket): void
}

export interface NodeServerInit {
  server: ConnectionHandler
}

class NodeServer implements Endpoint {
  private readonly server: ConnectionHandler

  constructor (init: NodeServerInit) {
    this.server = init.server
  }

  async inject (info: HeaderInfo, stream: Stream, connection: Connection): Promise<void> {
    // re-yield the headers to enable node to set up the request properly
    const streamSource = stream.source
    stream.source = (async function * () {
      yield info.raw
      yield * streamSource
    })()

    this.server.emit('connection', streamToSocket(stream, connection))
  }
}

export function nodeServer (server: ConnectionHandler): Endpoint {
  return new NodeServer({ server })
}

export function incomingMessageToRequest (req: IncomingMessage): Request {
  const headers = incomingHttpHeadersToHeaders(req.headers)
  const init: RequestInit = {
    method: req.method,
    headers
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // @ts-expect-error this is required by NodeJS despite being the only reasonable option https://fetch.spec.whatwg.org/#requestinit
    init.duplex = 'half'
    init.body = readableToReadableStream(req)
  }

  const url = new URL(`http://${headers.get('host') ?? 'example.com'}${req.url ?? '/'}`)

  return new Request(url, init)
}

function incomingHttpHeadersToHeaders (input: IncomingMessage['headers']): Headers {
  const headers = new Headers()

  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const val of value) {
        headers.append(key, val)
      }
    } else {
      headers.set(key, value)
    }
  }

  return headers
}

export function writeResponse (res: Response, ser: ServerResponse): void {
  const headers: Record<string, string> = {}

  res.headers.forEach((val, key) => {
    headers[key] = val
  })

  ser.writeHead(res.status, res.statusText, headers)

  if (res.body == null) {
    ser.end()
  } else {
    const reader = res.body.getReader()

    Promise.resolve().then(async () => {
      while (true) {
        const { done, value } = await reader.read()

        if (value != null) {
          ser.write(value)
        }

        if (done) {
          break
        }
      }

      ser.end()
    })
      .catch(err => {
        ser.end(err)
      })
  }
}
