/* eslint-disable no-console */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { serve } from '@hono/node-server'
import { WELL_KNOWN_PROTOCOLS, httpCustomServer } from '@libp2p/http-fetch'
import { PING_PROTOCOL_ID, servePing } from '@libp2p/http-fetch/ping.js'
import { tcp } from '@libp2p/tcp'
import { Hono } from 'hono'
import { createLibp2p } from 'libp2p'

const app = new Hono()

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000']
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { http: httpCustomServer({ customHTTPHandler: app.fetch.bind(app) }) }
})

app.get(WELL_KNOWN_PROTOCOLS, async (c) => {
  return node.services.http.serveWellKnownProtocols(c.req)
})
app.get('/my-app', (c) => c.text('Hono!'))
node.services.http.registerProtocol('/example-app/0.0.1', '/my-app')

// Register HTTP ping protocol
app.all('/ping', (c) => {
  return servePing(c.req)
})
node.services.http.registerProtocol(PING_PROTOCOL_ID, '/ping')

// start libp2p
await node.start()
console.error('libp2p has started')

// Also listen on a standard http transport
const server = serve({
  fetch: app.fetch,
  port: 8001,
  hostname: '127.0.0.1'
})

const listenAddrs = node.getMultiaddrs()
console.error('libp2p is listening on the following addresses:')
console.log('/ip4/127.0.0.1/tcp/8001/http')
for (const addr of listenAddrs) {
  console.log(addr.toString())
}
console.log('') // Empty line to signal we have no more addresses (for test runner)

// wait for SIGINT
await new Promise(resolve => process.on('SIGINT', resolve))

// Stop the http server
server.close()

// stop libp2p
node.stop()
console.error('libp2p has stopped')
