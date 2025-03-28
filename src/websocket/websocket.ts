import { TypedEventEmitter } from '@libp2p/interface'
import { isPromise } from '@libp2p/utils/is-promise'
import { byteStream, type ByteStream } from 'it-byte-stream'
import { Uint8ArrayList } from 'uint8arraylist'
import { PROTOCOL } from '../constants.js'
import { ErrorEvent } from './events.js'
import { encodeMessage, decodeMessage, CLOSE_MESSAGES } from './message.js'
import { performClientUpgrade, performServerUpgrade, readResponse, toBytes } from './utils.js'
import type { CloseListener, ErrorListener, MessageListener, OpenListener, WebSocketEvents } from './index.js'
import type { MESSAGE_TYPE } from './message.js'
import type { HeaderInfo } from '../index.js'
import type { Stream, AbortOptions } from '@libp2p/interface'
import type { ConnectionManager } from '@libp2p/interface-internal'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const DATA_MESSAGES: MESSAGE_TYPE[] = ['BINARY', 'TEXT', 'CONTINUATION']
const MAX_MESSAGE_SIZE = 10_485_760
const DEFAULT_HOST = 'example.com'

export interface WebSocketInit extends AbortOptions {
  protocols?: string[]
  isClient?: boolean

  /**
   * The maximum message size to be sent or received over the socket in bytes
   *
   * @default 10_485_760
   */
  maxMessageSize?: number
}

export abstract class AbstractWebSocket extends TypedEventEmitter<WebSocketEvents> {
  public readonly binaryType = 'arraybuffer'
  public bufferedAmount = 0
  public extensions = ''
  public protocol: string = ''
  public readyState: number
  public url: string

  public CONNECTING: 0 = 0
  public OPEN: 1 = 1
  public CLOSING: 2 = 2
  public CLOSED: 3 = 3

  private _onclose?: CloseListener
  private _onerror?: ErrorListener
  private _onmessage?: MessageListener
  private _onopen?: OpenListener

  private sentClose: boolean
  private readonly isClient: boolean
  private readonly buffer: Uint8ArrayList
  private readonly maxMessageSize: number
  protected readonly _url?: URL
  protected readonly closeController: AbortController

  constructor (url: URL, init: WebSocketInit = {}) {
    super()

    this.readyState = this.CONNECTING
    this.url = url.pathname
    this.sentClose = false
    this.isClient = init.isClient ?? true
    this.buffer = new Uint8ArrayList()
    this.closeController = new AbortController()
    this.maxMessageSize = init.maxMessageSize ?? MAX_MESSAGE_SIZE
  }

  send (data: string | Blob | Uint8Array | ArrayBuffer | DataView): void {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket was not open')
    }

    const b = toBytes(data)

    if (isPromise(b)) {
      b.then(b => {
        this._send('BINARY', b)
      })
        .catch(err => {
          this._errored(err)
        })
    } else {
      this._send('BINARY', b)
    }
  }

  _send (type: MESSAGE_TYPE, data?: Uint8Array): void {
    if (this.readyState !== this.OPEN) {
      return
    }

    const message = encodeMessage(type, data, this.isClient)

    const byteLength = message.byteLength
    this.bufferedAmount += byteLength

    this._write(message, (err) => {
      this.bufferedAmount -= byteLength

      if (err != null) {
        this._errored(err)
      }
    })
  }

  close (code?: number, reason?: string): void {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket was not open')
    }

    this.readyState = this.CLOSING
    this.sentClose = true
    this._send('CONNECTION_CLOSE')
  }

  _errored (err: Error): void {
    this.readyState = this.CLOSED
    this.dispatchEvent(new ErrorEvent(err))
  }

  set onclose (listener: CloseListener) {
    this._onclose = listener
    this.addEventListener('close', listener)
  }

  get onclose (): CloseListener | null {
    return this._onclose ?? null
  }

  set onerror (listener: ErrorListener) {
    this._onerror = listener
    this.addEventListener('error', listener)
  }

  get onerror (): ErrorListener | null {
    return this._onerror ?? null
  }

  set onmessage (listener: MessageListener) {
    this._onmessage = listener
    this.addEventListener('message', listener)
  }

  get onmessage (): MessageListener | null {
    return this._onmessage ?? null
  }

  set onopen (listener: OpenListener) {
    this._onopen = listener
    this.addEventListener('open', listener)
  }

  get onopen (): OpenListener | null {
    return this._onopen ?? null
  }

  protected _push (buf: Uint8Array | Uint8ArrayList): void {
    this.buffer.append(buf)

    if (this.buffer.byteLength > this.maxMessageSize) {
      this.close(CLOSE_MESSAGES.MESSAGE_TOO_BIG, 'Max message size exceeded')
      return
    }

    while (true) {
      const message = decodeMessage(this.buffer)

      if (message == null) {
        break
      }

      if (DATA_MESSAGES.includes(message.type) && message.data != null) {
        this.dispatchEvent(new MessageEvent('message', {
          data: message.data,
          origin: this._url?.hostname
        }))
      }

      // respond to pings
      if (message.type === 'PING') {
        this._send('PONG', message.data)
      }

      // close handshake
      if (message.type === 'CONNECTION_CLOSE') {
        if (!this.sentClose) {
          this.close()
        }

        this.closeController.abort()
        this._close(undefined, () => {
          this.readyState = this.CLOSED
          this.dispatchEvent(new CloseEvent('close'))
        })
      }
    }
  }

  /**
   * To be invoked when the underlying transport is closed by the remote end
   */
  protected _remoteClosed (err?: Error): void {
    this.readyState = this.CLOSING
    this._close(err, () => {
      this.readyState = this.CLOSED
      this.dispatchEvent(new CloseEvent('close'))
    })
  }

  /**
   * Invoked when data is to be sent over the socket, the passed callback should
   * be called when the data has been written
   */
  protected abstract _write (buf: Uint8ArrayList, cb: (err?: Error | null) => void): void

  /**
   * The implementation of this method should close the underlying transport. If
   * an error is passed, the transport should be closed immediately.
   *
   * The passed callback should be invoked when the transport has closed
   */
  protected abstract _close (err: Error | undefined, cb: () => void): void
}

export class ServerWebSocket extends AbstractWebSocket {
  private readonly duplex: Duplex

  constructor (request: IncomingMessage, duplex: Duplex, init: WebSocketInit = {}) {
    super(new URL(`http://${request.headers.host ?? DEFAULT_HOST}${request.url}`), {
      ...init,
      isClient: false
    })

    this.duplex = duplex

    this.duplex.on('data', (buf) => {
      this._push(buf)
    })
    this.duplex.on('close', () => {
      this.close()
    })
    this.duplex.on('error', (err) => {
      this.close(CLOSE_MESSAGES.ABNORMAL_CLOSURE, err.message)
    })

    Promise.resolve().then(async () => {
      for await (const buf of performServerUpgrade(request.headers)) {
        this.duplex.write(buf)
      }

      this.readyState = this.OPEN
      this.dispatchEvent(new Event('open'))
    })
      .catch(err => {
        this.duplex.destroy(err)
      })
  }

  _write (buf: Uint8ArrayList, cb: (err?: Error | null) => void): void {
    this.duplex.write(buf.subarray(), cb)
  }

  _close (err: Error, cb: () => void): void {
    this.readyState = this.CLOSED
    this.duplex.destroy(err)
    cb()
  }
}

export class StreamWebSocket extends AbstractWebSocket {
  private readonly bytes: ByteStream<Stream>

  constructor (info: HeaderInfo, stream: Stream, init?: WebSocketInit) {
    super(new URL(`http://${info.headers.get('host') ?? DEFAULT_HOST}${info.url}`), {
      ...init,
      isClient: false
    })

    this.bytes = byteStream(stream)

    Promise.resolve()
      .then(async () => {
        for await (const buf of performServerUpgrade(info.headers)) {
          await this.bytes.write(buf)
        }

        this.readyState = this.OPEN
        this.dispatchEvent(new Event('open'))

        while (true) {
          const buf = await this.bytes.read()

          if (buf == null) {
            this._remoteClosed()
            break
          }

          this._push(buf)
        }
      })
      .catch(err => {
        this._errored(err)
      })
  }

  _write (buf: Uint8ArrayList, cb: (err?: Error | null) => void): void {
    this.bytes?.write(buf)
      .then(() => {
        cb()
      }, err => {
        cb(err)
      })
  }

  _close (err: Error, cb: () => void): void {
    const stream = this.bytes?.unwrap()

    if (err != null) {
      stream?.abort(err)
      cb()
    } else {
      stream?.close()
        .then(() => {
          cb()
        }, err => {
          stream.abort(err)
          cb()
        })
    }
  }
}

export class WebSocket extends AbstractWebSocket {
  private bytes?: ByteStream<Stream>

  constructor (mas: Multiaddr[], url: URL, connectionManager: ConnectionManager, init: WebSocketInit = {}) {
    super(url, {
      ...init,
      isClient: true
    })

    Promise.resolve()
      .then(async () => {
        const connection = await connectionManager.openConnection(mas, init)
        const stream = await connection.newStream(PROTOCOL, init)
        this.bytes = byteStream(stream)

        for await (const buf of performClientUpgrade(url, init.protocols)) {
          await this.bytes.write(buf)
        }

        const res = await readResponse(this.bytes, {})

        if (res.status !== 101) {
          throw new Error('Invalid WebSocket handshake')
        }

        // if a protocol was selected by the server, expose it
        this.protocol = res.headers.get('Sec-WebSocket-Protocol') ?? ''

        this.readyState = this.OPEN
        this.dispatchEvent(new Event('open'))

        for await (const buf of stream.source) {
          this._push(buf)
        }
      })
      .catch(err => {
        this._errored(err)
      })
  }

  _write (buf: Uint8ArrayList, cb: (err?: Error | null) => void): void {
    if (this.bytes == null) {
      cb(new Error('WebSocket was not open'))
      return
    }

    this.bytes.write(buf)
      .then(() => {
        cb()
      }, (err) => {
        cb(err)
      })
  }

  _close (err: Error | undefined, cb: () => void): void {
    if (this.bytes == null) {
      cb()
      return
    }

    const stream = this.bytes.unwrap()

    if (err != null) {
      stream.abort(err)
      cb()
      return
    }

    stream.close()
      .catch((err) => {
        stream.abort(err)
      })
      .finally(() => {
        cb()
      })
  }
}
