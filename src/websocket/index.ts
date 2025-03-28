import { WebSocketServer as WebSocketServerClass } from './server.js'
import type { IncomingMessage } from '../http/incoming-message.js'
import type { TypedEventTarget } from '@libp2p/interface'
import type { Duplex } from 'node:stream'

export interface WebSocketEvents {
  'close': CloseEvent
  'error': Event
  'message': MessageEvent
  'open': Event
}

export interface CloseListener {
  (evt: CloseEvent): void
}

export interface ErrorListener {
  (evt: Event): void
}

export interface MessageListener {
  (evt: MessageEvent): void
}

export interface OpenListener {
  (evt: Event): void
}

export interface WebSocket extends TypedEventTarget<WebSocketEvents> {
  CONNECTING: 0
  OPEN: 1
  CLOSING: 2
  CLOSED: 3
  binaryType: BinaryType
  bufferedAmount: number
  extensions: string
  protocol: string
  readyState: number
  url: string
  onopen: OpenListener | null
  onmessage: MessageListener | null
  onerror: ErrorListener | null
  onclose: CloseListener | null

  close (code?: number, reason?: string): void
  send (data: string | Blob | Uint8Array | ArrayBuffer | DataView): void
}

export class ConnectionEvent extends Event {
  webSocket: WebSocket
  request: IncomingMessage

  constructor (ws: WebSocket, req: IncomingMessage) {
    super('connection')

    this.webSocket = ws
    this.request = req
  }
}

export interface WebSocketServerEvents {
  connection: ConnectionEvent
}

export interface WebSocketServer extends TypedEventTarget<WebSocketServerEvents> {
  handleUpgrade (request: IncomingMessage, socket: Duplex, head: Uint8Array): void
}

/**
 * Creates a WebSocket server that can handle upgrade requests from clients.
 *
 * Add a listener for the `connection` event to receive incoming WebSocket
 * connections.
 *
 * @example
 *
 * ```ts
 * import { createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'
 *
 * const wss = createWebSocketServer()
 * wss.addEventListener('connection', (evt) => {
 *   const ws = evt.webSocket
 *
 *   ws.on('message', (data) => {
 *     ws.send(data)
 *   })
 * })
 *
 * const server = createServer((req, res) => {
 *   // handle HTTP request
 * })
 *
 * server.addListener('upgrade', (request, socket, head) => {
 *   wss.handleUpgrade(request, socket, head, (ws) => {
 *     wss.emit('connection', ws, request)
 *   })
 * })
 * ``
 */
export function createWebSocketServer (): WebSocketServer {
  return new WebSocketServerClass()
}
