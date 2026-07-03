import { EventEmitter } from 'node:events'
import { HTTPParser } from '@achingbrain/http-parser-js'
import { NOT_IMPLEMENTED_ERROR } from '@libp2p/http-utils'
import { IncomingMessage as IncomingMessageClass } from './incoming-message.ts'
import { ServerResponse as ServerResponseClass } from './server-response.ts'
import type { ServerOptions, ServerResponse, IncomingMessage } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

export interface HTTPServerEvents <Request, Response> {
  request: [Request, Response]
}

export class HTTPServer <
  Request extends typeof IncomingMessage = typeof IncomingMessage,
  Response extends typeof ServerResponse<InstanceType<Request>> = typeof ServerResponse
> extends EventEmitter {
  public maxHeadersCount: number | null
  public maxHeaderSize: number | null
  public maxRequestsPerSocket: number | null
  public timeout: number
  public headersTimeout: number
  public keepAliveTimeout: number
  public requestTimeout: number
  public maxConnections: number
  public connections: number
  public keepAliveTimeoutBuffer: number
  private _listening: boolean
  private readonly _options: ServerOptions<Request, Response>

  constructor (options: ServerOptions<Request, Response> = {}) {
    super()

    this.maxHeadersCount = 0
    this.maxRequestsPerSocket = 0
    this.timeout = 0
    this.headersTimeout = 120_000
    this.keepAliveTimeout = options.keepAliveTimeout ?? 0
    this.requestTimeout = options.requestTimeout ?? 120_000
    this.maxHeaderSize = options.maxHeaderSize ?? HTTPParser.maxHeaderSize
    this.maxConnections = 0
    this.connections = 0
    this.keepAliveTimeoutBuffer = options.keepAliveTimeoutBuffer ?? 1_000
    this._listening = false
    this._options = options

    this.on('connection', this._handleConnection.bind(this))
  }

  private _handleConnection (socket: Socket): void {
    let req: IncomingMessage | undefined

    const parser = new HTTPParser('REQUEST')
    parser.maxHeaderSize = this.maxHeaderSize ?? HTTPParser.maxHeaderSize
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      const headers = new Headers()

      // set incoming headers
      for (let i = 0; i < info.headers.length; i += 2) {
        headers.append(info.headers[i].toLowerCase(), info.headers[i + 1])
      }

      req = new IncomingMessageClass(socket, {
        ...info,
        headers
      })
      const res = new ServerResponseClass(req, socket)

      if (info.upgrade) {
        const listeners = this.listenerCount('upgrade')

        if (listeners === 0) {
          socket.write(NOT_IMPLEMENTED_ERROR)
          // socket.end()
          return
        } else {
          this.emit('upgrade', req, socket, new Uint8Array(0))
          return
        }
      }

      this.emit('request', req, res)
    }
    parser[HTTPParser.kOnBody] = (buf) => {
      req?.push(buf)
    }

    parser[HTTPParser.kOnMessageComplete] = () => {
      req?.push(null)
    }

    socket.on('data', (chunk) => {
      parser.execute(chunk, 0, chunk.byteLength)
    })
    socket.on('end', () => {
      parser.finish()
      req?.push(null)
    })
  }

  setTimeout (...args: any[]): this {
    return this
  }

  closeAllConnections (): void {

  }

  closeIdleConnections (): void {

  }

  listen (...args: any[]): this {
    this._listening = true
    return this
  }

  close (callback?: (err?: Error) => void): this {
    this._listening = false
    callback?.()
    return this
  }

  address (): AddressInfo | string | null {
    return null
  }

  getConnections (cb: (error: Error | null, count: number) => void): this {
    cb(null, this.connections)
    return this
  }

  ref (): this {
    return this
  }

  unref (): this {
    return this
  }

  get listening (): boolean {
    return this._listening
  }

  set listening (listening: boolean) {

  }

  async [Symbol.asyncDispose] (): Promise<void> {

  }
}
