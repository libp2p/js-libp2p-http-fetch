import type { Libp2pOverHTTPHandler } from './get-libp2p-over-http-handler.js'
import type { Server, RequestListener } from 'node:http'

export function createHttp (server: Server, handler?: Libp2pOverHTTPHandler): Server {
  const app: RequestListener = (req, res) => {
    if (req.url === '/echo') {
      req.pipe(res)

      return
    }

    res.end('Hello World!')
  }

  server.on('request', (req, res) => {
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
