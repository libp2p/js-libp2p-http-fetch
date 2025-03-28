/* eslint-disable no-console */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { http } from '@libp2p/http-fetch'
import { PING_PROTOCOL_ID, servePing } from '@libp2p/http-fetch/ping'
import { tcp } from '@libp2p/tcp'
import express from 'express'
import { createLibp2p } from 'libp2p'

const app = express()

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000']
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    http: http()
  }
})

node.services.http.registerProtocol(PING_PROTOCOL_ID, '/ping')

// start libp2p
await node.start()
console.error('libp2p has started')

// Also listen on a standard http transport
const server = servePing({
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
