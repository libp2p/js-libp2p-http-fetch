import express from 'express'
import type { Libp2pOverHTTPHandler } from './get-libp2p-over-http-handler.js'
import type { Server } from 'node:http'

/**
 * Creates an Express server that optionally delegates request handling to a
 * Libp2p Over HTTP handler
 */
export function createExpress (server: Server, handler?: Libp2pOverHTTPHandler): Server {
  const app = express()
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
