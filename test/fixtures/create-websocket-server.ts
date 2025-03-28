import { createWebSocketServer as createWss } from '../../src/websocket/index.js'
import type { Libp2pOverHTTPHandler, Libp2pOverWSHandler } from './get-libp2p-over-http-handler.js'
import type { Server } from 'node:http'

export function createWebSocketServer (server: Server, httpHandler?: Libp2pOverHTTPHandler, wsHandler?: Libp2pOverWSHandler): Server {
  const wss = createWss()
  wss.addEventListener('connection', (evt) => {
    const ws = evt.webSocket

    if (wsHandler?.(ws) === true) {
      return
    }

    if (ws.url === '/echo') {
      ws.addEventListener('message', (evt) => {
        ws.send(evt.data)
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
    wss.handleUpgrade(request, socket, head)
  })

  return server
}
