import { TypedEventEmitter } from '@libp2p/interface'
import { raceEvent } from 'race-event'
import { INTERNAL_SERVER_ERROR } from '../utils.js'
import { ServerWebSocket } from './websocket.js'
import { ConnectionEvent, type WebSocketServerEvents } from './index.js'
import type { IncomingMessage } from '../http/incoming-message.js'
import type { Duplex } from 'node:stream'

const DEFAULT_UPGRADE_TIMEOUT = 10_000

export interface WebSocketServerInit {
  upgradeTimeout?: number
}

export class WebSocketServer extends TypedEventEmitter<WebSocketServerEvents> {
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
