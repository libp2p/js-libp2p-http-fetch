import { INTERNAL_SERVER_ERROR } from '@libp2p/http-utils'
import { ServerWebSocket } from '@libp2p/http-websocket'
import { TypedEventEmitter } from '@libp2p/interface'
import { raceEvent } from 'race-event'
import type { IncomingMessage } from './incoming-message.ts'
import type { WebSocketServerEvents, WebSocketServer as WebSocketServerInterface } from './index.ts'
import type { Duplex } from 'node:stream'

const DEFAULT_UPGRADE_TIMEOUT = 10_000

export interface WebSocketServerInit {
  upgradeTimeout?: number
}

class WebSocketServer extends TypedEventEmitter<WebSocketServerEvents> {
  private readonly upgradeTimeout: number

  constructor (init: WebSocketServerInit = {}) {
    super()

    this.upgradeTimeout = init.upgradeTimeout ?? DEFAULT_UPGRADE_TIMEOUT
  }

  handleUpgrade (request: IncomingMessage, socket: Duplex, head: Uint8Array): void {
    Promise.resolve()
      .then(async () => {
        const ws = new ServerWebSocket(request, socket)

        await raceEvent(ws, 'open', AbortSignal.timeout(this.upgradeTimeout))

        this.dispatchEvent(new ConnectionEvent(ws, request))
      })
      .catch(() => {
        socket.write(INTERNAL_SERVER_ERROR)
      })
  }
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

/**
 * Creates a WebSocket server that can handle upgrade requests from clients.
 *
 * Add a listener for the `connection` event to receive incoming WebSocket
 * connections.
 *
 * @example
 *
 * ```ts
 * import { createServer, createWebSocketServer } from '@libp2p/http'
 *
 * const wss = createWebSocketServer()
 * wss.addEventListener('connection', (evt) => {
 *   const ws = evt.webSocket
 *
 *   ws.addEventListener('message', (evt) => {
 *     ws.send(evt.data)
 *   })
 * })
 *
 * const server = createServer((req, res) => {
 *   // handle HTTP request
 * })
 *
 * server.addListener('upgrade', (request, socket, head) => {
 *   wss.handleUpgrade(request, socket, head)
 * })
 * ``
 */
export function createWebSocketServer (): WebSocketServerInterface {
  return new WebSocketServer()
}
