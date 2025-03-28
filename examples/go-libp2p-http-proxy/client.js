/* eslint-disable no-console */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { http } from '@libp2p/http-fetch'
import { tcp } from '@libp2p/tcp'
import { multiaddr } from '@multiformats/multiaddr'
import { createLibp2p } from 'libp2p'

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: []
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { http: http() }
})

// start libp2p
await node.start()
console.error('libp2p has started')

// Read server multiaddr from the command line
const serverAddr = process.argv[2]
if (!serverAddr) {
  console.error('Please provide the server multiaddr as an argument')
  process.exit(1)
}

let serverMA = multiaddr(serverAddr)

// check if this is an http transport multiaddr
const isHTTPTransport = serverMA.protos().find(p => p.name === 'http')
if (!isHTTPTransport && serverMA.getPeerId() === null) {
  // Learn the peer id of the server. This lets us reuse the connection for all our HTTP requests.
  // Otherwise js-libp2p will open a new connection for each request.
  const conn = await node.dial(serverMA)
  serverMA = serverMA.encapsulate(`/p2p/${conn.remotePeer.toString()}`)
}

console.error(`Making request to ${serverMA.toString()}`)
try {
  const resp = await node.services.http.fetch(new Request(`multiaddr:${serverMA}`))
  const respBody = await resp.text()
  if (resp.status !== 200) {
    throw new Error(`Unexpected status code: ${resp.status}`)
  }
  if (respBody !== 'Hello, World!') {
    throw new Error(`Unexpected response body: ${respBody}`)
  }
  console.error('Got response:', respBody)
} finally {
  // stop libp2p
  await node.stop()
}
