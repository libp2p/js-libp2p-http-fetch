import { fastify } from 'fastify'
import type { Libp2pOverHTTPHandler } from './get-libp2p-over-http-handler.js'
import type { FastifyRequest } from 'fastify'
import type { Server, IncomingMessage } from 'node:http'

export async function createFastifyHTTP (server: Server, handler?: Libp2pOverHTTPHandler): Promise<Server> {
  const app = fastify({
    serverFactory: (app, opts) => {
      server.addListener('request', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Request-Method', '*')
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
        res.setHeader('Access-Control-Allow-Headers', '*')

        if (handler?.(req, res) !== true) {
          app(req, res)
        }
      })

      return server
    }
  })

  // fastify only supports 'application/json' and 'text/plain' by default
  app.addContentTypeParser('*', async (req: FastifyRequest, payload: IncomingMessage) => {
    return payload
  })
  app.get('/', async (req, reply) => {
    await reply.send('Hello World!')
  })
  app.post('/echo', (req, reply) => {
    if (typeof req.body === 'string') {
      return reply.send(req.body)
    }

    req.raw.on('data', (buf) => {
      reply.raw.write(buf)
    })
    req.raw.on('end', () => {
      reply.raw.end()
    })
    req.raw.on('error', (err) => {
      reply.raw.destroy(err)
    })
  })

  await app.ready()

  if (server == null) {
    throw new Error('Server not created')
  }

  return server
}
