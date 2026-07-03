import type { IncomingMessage } from './incoming-message.ts'
import type { ConnectionEvent } from './websocket-server.ts'
import type { TypedEventTarget } from '@libp2p/interface'
import type { Duplex } from 'node:stream'

export { createServer } from 'node:http'
export { createWebSocketServer } from './websocket-server.ts'

export interface HTTPRequestHandler {
  (req: Request): Promise<Response>
}

export interface WebSocketHandler {
  (ws: WebSocket): void
}

export interface WebSocketServerEvents {
  connection: ConnectionEvent
}

export interface WebSocketServer extends TypedEventTarget<WebSocketServerEvents> {
  handleUpgrade (request: IncomingMessage, socket: Duplex, head: Uint8Array): void
}

export type { IncomingMessage }
export type { ServerResponse } from './server-response.ts'
export * from './handler.ts'
