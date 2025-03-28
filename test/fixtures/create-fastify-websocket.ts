import fastifyWebSocket from '@fastify/websocket'
import { fastify } from 'fastify'
import { toWebSocket } from './to-websocket.js'
import type { Libp2pOverHTTPHandler, Libp2pOverWSHandler } from './get-libp2p-over-http-handler.js'
import type { Server } from 'node:http'

export async function createFastifyWebSocket (server: Server, httpHandler?: Libp2pOverHTTPHandler, wsHandler?: Libp2pOverWSHandler): Promise<Server> {
  const app = fastify({
    serverFactory: (app, opts) => {
      server.addListener('request', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Request-Method', '*')
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
        res.setHeader('Access-Control-Allow-Headers', '*')

        if (httpHandler?.(req, res) !== true) {
          app(req, res)
        }
      })

      return server
    }
  })
  await app.register(fastifyWebSocket)
  await app.register(async function (fastify) {
    fastify.get('/echo', { websocket: true }, (socket, req) => {
      socket.on('message', message => {
        socket.send(message)
      })
    })
    fastify.get('/*', { websocket: true }, (socket, req) => {
      if (wsHandler?.(toWebSocket(socket, req)) === true) {
        return
      }

      socket.send('Hello world!')
      socket.close()
    })
  })

  await app.ready()

  if (server == null) {
    throw new Error('Server not created')
  }

  return server
}
