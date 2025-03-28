import { WebSocketServer } from 'ws'
import { toWebSocket } from './to-websocket.js'
import type { Libp2pOverHTTPHandler, Libp2pOverWSHandler } from './get-libp2p-over-http-handler.js'
import type { Server } from 'node:http'

export function createWss (server: Server, httpHandler?: Libp2pOverHTTPHandler, wsHandler?: Libp2pOverWSHandler): Server {
  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (ws, req) => {
    if (wsHandler?.(toWebSocket(ws, req)) === true) {
      return
    }

    if (req.url === '/echo') {
      ws.on('message', (data) => {
        ws.send(data)
      })
    } else {
      ws.send('Hello world!')
      ws.close()
    }
  })

  server.on('request', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (httpHandler?.(req, res) === true) {
      return
    }

    res.writeHead(400)
    res.end()
  })
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  return server
}
