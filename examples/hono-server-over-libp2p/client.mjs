import { noise } from '@chainsafe/libp2p-noise'
import { multiaddr } from '@multiformats/multiaddr'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http-fetch'
import { sendPing } from  '@libp2p/http-fetch/ping.js'

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: []
  },
  transports: [tcp()],
  connectionEncryption: [noise()],
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

const isHTTPTransport = serverMA.protos().find(p => p.name === "http") // check if this is an http transport multiaddr
if (!isHTTPTransport && serverMA.getPeerId() === null) {
  // Learn the peer id of the server. This lets us reuse the connection for all our HTTP requests.
  // Otherwise js-libp2p will open a new connection for each request.
  const conn = await node.dial(serverMA)
  serverMA = serverMA.encapsulate(`/p2p/${conn.remotePeer.toString()}`)
}

console.error("Making request to", `${serverMA.toString()}`)
try {
  const resp = await node.services.http.fetch(new Request(`multiaddr:${serverMA}` + `/http-path/${encodeURIComponent('my-app')}`))
  const respBody = await resp.text()
  if (resp.status !== 200) {
    throw new Error(`Unexpected status code: ${resp.status}`)
  }
  if (respBody !== 'Hono!') {
    throw new Error(`Unexpected response body: ${respBody}`)
  }

  const start = new Date().getTime()
  await sendPing(node, serverMA)
  const end = new Date().getTime()
  console.error("HTTP Ping took", end - start, "ms")
} finally {
  await node.stop()
}
