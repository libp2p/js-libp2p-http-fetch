import { Writable } from 'node:stream'
import { STATUS_CODES } from '@libp2p/http-utils'
import { InvalidParametersError } from '@libp2p/interface'
import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'
import type { IncomingMessage } from './incoming-message.ts'
import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'

export class ServerResponse<Request extends IncomingMessage = IncomingMessage> extends Writable {
  public req: Request
  public chunkedEncoding: boolean
  public shouldKeepAlive: boolean
  public useChunkedEncodingByDefault: boolean
  public sendDate: boolean
  public finished: boolean
  public headersSent: boolean
  public connection: Socket | null
  public socket: Socket | null
  public statusCode: number
  public statusMessage: string
  public strictContentLength: boolean

  private readonly headers: Record<string, number | string | Array<number | string>>
  private sentHeaders: boolean

  constructor (req: Request, socket: Socket) {
    super()

    this.req = req
    this.headers = {}
    this.socket = socket
    this.connection = socket
    this.chunkedEncoding = false
    this.shouldKeepAlive = false
    this.useChunkedEncodingByDefault = false
    this.sendDate = false
    this.finished = false
    this.headersSent = false
    this.strictContentLength = false
    this.sentHeaders = false
    this.statusCode = 200
    this.statusMessage = STATUS_CODES[this.statusCode]
  }

  _write (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.flushHeaders(() => {
      this.socket?.write(chunk, encoding, callback)
    })
  }

  _final (callback: (error?: Error | null) => void): void {
    this.flushHeaders(() => {
      this.socket?.end(callback)
    })
  }

  _destroy (error: Error | null, callback: (error?: Error | null) => void): void {
    this.socket?.destroy(error ?? undefined)
    callback()
  }

  setTimeout (msecs: number, callback?: () => void): this {
    this.socket?.setTimeout(msecs, callback)
    return this
  }

  setHeader (name: string, value: number | string | string[]): this {
    this.headers[name] = value
    return this
  }

  setHeaders (headers: Headers | Map<string, number | string | string[]>): this {
    for (const [key, value] of headers.entries()) {
      this.setHeader(key, value)
    }

    return this
  }

  appendHeader (name: string, value: string | string[]): this {
    if (this.headers[name] == null) {
      this.headers[name] = value
    } else {
      let existingValue = this.headers[name]

      if (!Array.isArray(existingValue)) {
        existingValue = [existingValue]
        this.headers[name] = existingValue
      }

      if (Array.isArray(value)) {
        existingValue.push(...value)
      } else {
        existingValue.push(value)
      }
    }

    return this
  }

  getHeader (name: string): number | string | string[] | undefined {
    const existingValue = this.headers[name]

    if (Array.isArray(existingValue)) {
      return existingValue.map(v => v.toString())
    }

    return existingValue
  }

  getHeaders (): OutgoingHttpHeaders {
    const output: OutgoingHttpHeaders = {}

    for (const name of Object.keys(this.headers)) {
      output[name] = this.getHeader(name)
    }

    return output
  }

  getHeaderNames (): string[] {
    return [...Object.keys(this.headers)]
  }

  hasHeader (name: string): boolean {
    return this.headers[name] != null
  }

  removeHeader (name: string): void {
    delete this.headers[name]
  }

  addTrailers (headers: OutgoingHttpHeaders | ReadonlyArray<[string, string]>): void {

  }

  flushHeaders (callback?: () => void): void {
    if (this.sentHeaders) {
      callback?.()
      return
    }

    this.sentHeaders = true

    const res = [
      `HTTP/1.1 ${this.statusCode} ${this.statusMessage}`,
      ...writeHeaders(this.headers),
      '',
      ''
    ]

    this.socket?.write(uint8arrayFromString(res.join('\r\n')), callback)
  }

  writeContinue (callback?: () => void): void {
    const res = [
      `HTTP/1.1 100 ${STATUS_CODES[100]}`,
      '',
      ''
    ]

    this.socket?.write(uint8arrayFromString(res.join('\r\n')), callback)
  }

  writeEarlyHints (hints: Record<string, string | string[]>, callback?: () => void): void {
    const res = [
      `HTTP/1.1 103 ${STATUS_CODES[103]}`,
      ...writeHeaders(hintsToHeaders(hints)),
      '',
      ''
    ]

    this.socket?.write(uint8arrayFromString(res.join('\r\n')), callback)
  }

  writeHead (statusCode: number, statusMessage?: string, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]): this
  writeHead (statusCode: number, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]): this
  writeHead (...args: any[]): this {
    const statusCode = parseInt(args[0] ?? this.statusCode, 10)
    let headers: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined = args[1]

    if (args.length === 3) {
      this.statusMessage = args[1] ?? this.statusMessage
      headers = args[2]
    }

    if (headers != null) {
      for (const [key, value] of Object.keys(headers)) {
        this.setHeader(key, value)
      }
    }

    if (STATUS_CODES[statusCode] == null) {
      throw new InvalidParametersError(`Unknown status code ${statusCode}`)
    }

    this.statusCode = statusCode

    this.flushHeaders()

    return this
  }

  writeProcessing (): void {
    const res = [
      `HTTP/1.1 102 ${STATUS_CODES[102]}`,
      '',
      ''
    ]

    this.socket?.write(uint8arrayFromString(res.join('\r\n')))
  }

  end (cb?: (() => void) | undefined): this
  end (chunk: any, cb?: (() => void) | undefined): this
  end (chunk: any, encoding: BufferEncoding, cb?: (() => void) | undefined): this
  end (chunk?: any, encoding?: any, cb?: any): this {
    super.end(chunk, encoding, cb)

    return this
  }
}

function hintsToHeaders (hints: Record<string, string | string[]>): Record<string, string[]> {
  const output: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(hints)) {
    output[key] = Array.isArray(value) ? value : [value]
  }

  return output
}

function writeHeaders (headers: Record<string, number | string | Array<number | string>>): string[] {
  const output = []

  for (const [key, value] of Object.entries(headers)) {
    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      value.forEach(value => {
        output.push(`${key}: ${value}`)
      })
    } else {
      output.push(`${key}: ${value}`)
    }
  }

  return output
}
