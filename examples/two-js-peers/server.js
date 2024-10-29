/* eslint-disable no-console */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { http } from '@libp2p/http-fetch'
import { PING_PROTOCOL_ID, servePing } from '@libp2p/http-fetch/ping.js'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000']
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { http: http() }
})

// start libp2p
await node.start()
console.error('libp2p has started')

const listenAddrs = node.getMultiaddrs()
console.error('libp2p is listening on the following address:')
console.log(listenAddrs[0].toString())
console.log('') // Empty line to signal we have no more addresses (for test runner)

node.services.http.handleHTTPProtocol(PING_PROTOCOL_ID, '/ping', servePing)

// sleep 100s
await new Promise(resolve => setTimeout(resolve, 100000))

// stop libp2p
await node.stop()
console.error('libp2p has stopped')
