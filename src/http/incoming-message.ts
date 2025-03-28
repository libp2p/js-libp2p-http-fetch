import { Readable } from 'node:stream'
import { HTTPParser } from '@achingbrain/http-parser-js'
import type { HeaderInfo } from '@achingbrain/http-parser-js'
import type { IncomingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'

export class IncomingMessage extends Readable {
  public aborted: boolean
  public httpVersion: string
  public httpVersionMajor: number
  public httpVersionMinor: number
  public complete: boolean
  public connection: Socket
  public socket: Socket
  public headers: IncomingHttpHeaders
  public headersDistinct: NodeJS.Dict<string[]>
  public rawHeaders: string[]
  public trailers: NodeJS.Dict<string>
  public trailersDistinct: NodeJS.Dict<string[]>
  public rawTrailers: string[]
  public method?: string | undefined
  public url?: string | undefined
  public statusCode?: number | undefined
  public statusMessage?: string | undefined

  constructor (socket: Socket, info: HeaderInfo<Headers>) {
    super({
      read () {
        if (socket.isPaused()) {
          socket.resume()
        }
      }
    })
    this.aborted = false
    this.socket = socket
    this.httpVersion = `${info.versionMajor}.${info.versionMinor}`
    this.httpVersionMajor = info.versionMajor
    this.httpVersionMinor = info.versionMinor
    this.method = HTTPParser.methods[info.method]
    this.statusCode = info.statusCode
    this.statusMessage = info.statusMessage
    this.url = info.url
    this.complete = false
    this.connection = socket
    this.headers = {}
    this.headersDistinct = {}
    this.rawHeaders = []
    this.trailers = {}
    this.trailersDistinct = {}
    this.rawTrailers = []

    // set incoming headers
    for (const [key, value] of info.headers.entries()) {
      this.headers[key] = value
      this.rawHeaders.push(key, value)
    }
  }

  setTimeout (msecs: number, callback?: () => void): this {
    this.socket.setTimeout(msecs, callback)
    return this
  }

  destroy (error?: Error): this {
    if (error != null) {
      this.socket.destroy(error)
    }

    return this
  }
}
