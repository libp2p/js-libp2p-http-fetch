import cookieParser from 'cookie-parser'
import express from 'express'
import type { CanHandle } from '@libp2p/http-server/node'
import type { Server } from 'node:http'

/**
 * Creates an Express server that optionally delegates request handling to a
 * Libp2p Over HTTP handler
 */
export function createExpress (server: Server, handled?: CanHandle): Server {
  const app = express()
  app.use(cookieParser())
  app.get('/', (req, res) => {
    res.send('Hello World!')
  })
  app.post('/echo', (req, res) => {
    req.on('data', (buf) => {
      res.write(buf)
    })
    req.on('end', () => {
      res.end()
    })
    req.on('error', (err) => {
      res.destroy(err)
    })
  })
  app.get('/set-cookies', (req, res) => {
    res.appendHeader('set-cookie', `cookie-1=value-1; Domain=${req.headers.host}; Max-Age=3600`)
    res.appendHeader('set-cookie', 'cookie-2=value-2')
    res.writeHead(201)
    res.end()
  })
  app.get('/get-cookies', (req, res) => {
    res.end(JSON.stringify(Object.entries(req.cookies).map(([key, value]) => `${key}=${value}`)))
  })

  server.on('request', (req, res) => {
    if (handled?.(req, res) === true) {
      return
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    app(req, res)
  })

  return server
}
