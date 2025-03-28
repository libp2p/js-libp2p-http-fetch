import { Writable } from 'node:stream'
import { InvalidParametersError } from '@libp2p/interface'
import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'
import type { IncomingMessage } from './incoming-message.js'
import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'

const STATUS_CODES: Record<string, string> = {
  100: 'Continue', // RFC 7231 6.2.1
  101: 'Switching Protocols', // RFC 7231 6.2.2
  102: 'Processing', // RFC 2518 10.1 (obsoleted by RFC 4918)
  103: 'Early Hints', // RFC 8297 2
  200: 'OK', // RFC 7231 6.3.1
  201: 'Created', // RFC 7231 6.3.2
  202: 'Accepted', // RFC 7231 6.3.3
  203: 'Non-Authoritative Information', // RFC 7231 6.3.4
  204: 'No Content', // RFC 7231 6.3.5
  205: 'Reset Content', // RFC 7231 6.3.6
  206: 'Partial Content', // RFC 7233 4.1
  207: 'Multi-Status', // RFC 4918 11.1
  208: 'Already Reported', // RFC 5842 7.1
  226: 'IM Used', // RFC 3229 10.4.1
  300: 'Multiple Choices', // RFC 7231 6.4.1
  301: 'Moved Permanently', // RFC 7231 6.4.2
  302: 'Found', // RFC 7231 6.4.3
  303: 'See Other', // RFC 7231 6.4.4
  304: 'Not Modified', // RFC 7232 4.1
  305: 'Use Proxy', // RFC 7231 6.4.5
  307: 'Temporary Redirect', // RFC 7231 6.4.7
  308: 'Permanent Redirect', // RFC 7238 3
  400: 'Bad Request', // RFC 7231 6.5.1
  401: 'Unauthorized', // RFC 7235 3.1
  402: 'Payment Required', // RFC 7231 6.5.2
  403: 'Forbidden', // RFC 7231 6.5.3
  404: 'Not Found', // RFC 7231 6.5.4
  405: 'Method Not Allowed', // RFC 7231 6.5.5
  406: 'Not Acceptable', // RFC 7231 6.5.6
  407: 'Proxy Authentication Required', // RFC 7235 3.2
  408: 'Request Timeout', // RFC 7231 6.5.7
  409: 'Conflict', // RFC 7231 6.5.8
  410: 'Gone', // RFC 7231 6.5.9
  411: 'Length Required', // RFC 7231 6.5.10
  412: 'Precondition Failed', // RFC 7232 4.2
  413: 'Payload Too Large', // RFC 7231 6.5.11
  414: 'URI Too Long', // RFC 7231 6.5.12
  415: 'Unsupported Media Type', // RFC 7231 6.5.13
  416: 'Range Not Satisfiable', // RFC 7233 4.4
  417: 'Expectation Failed', // RFC 7231 6.5.14
  418: 'I\'m a Teapot', // RFC 7168 2.3.3
  421: 'Misdirected Request', // RFC 7540 9.1.2
  422: 'Unprocessable Entity', // RFC 4918 11.2
  423: 'Locked', // RFC 4918 11.3
  424: 'Failed Dependency', // RFC 4918 11.4
  425: 'Too Early', // RFC 8470 5.2
  426: 'Upgrade Required', // RFC 2817 and RFC 7231 6.5.15
  428: 'Precondition Required', // RFC 6585 3
  429: 'Too Many Requests', // RFC 6585 4
  431: 'Request Header Fields Too Large', // RFC 6585 5
  451: 'Unavailable For Legal Reasons', // RFC 7725 3
  500: 'Internal Server Error', // RFC 7231 6.6.1
  501: 'Not Implemented', // RFC 7231 6.6.2
  502: 'Bad Gateway', // RFC 7231 6.6.3
  503: 'Service Unavailable', // RFC 7231 6.6.4
  504: 'Gateway Timeout', // RFC 7231 6.6.5
  505: 'HTTP Version Not Supported', // RFC 7231 6.6.6
  506: 'Variant Also Negotiates', // RFC 2295 8.1
  507: 'Insufficient Storage', // RFC 4918 11.5
  508: 'Loop Detected', // RFC 5842 7.2
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended', // RFC 2774 7
  511: 'Network Authentication Required' // RFC 6585 6
}

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
    this.flushHeaders()
    this.socket?.write(chunk, encoding, callback)
  }

  _final (callback: (error?: Error | null) => void): void {
    this.socket?.end(callback)
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
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.headers[name]
  }

  addTrailers (headers: OutgoingHttpHeaders | ReadonlyArray<[string, string]>): void {

  }

  flushHeaders (): void {
    if (this.sentHeaders) {
      return
    }

    this.sentHeaders = true

    const res = [
      `HTTP/1.1 ${this.statusCode} ${this.statusMessage}`,
      ...writeHeaders(this.headers),
      '',
      ''
    ]

    this.socket?.write(uint8arrayFromString(res.join('\r\n')))
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
      output.push(`${key}: ${value.join(', ')}`)
    } else {
      output.push(`${key}: ${value}`)
    }
  }

  return output
}
