import { noise } from '@chainsafe/libp2p-noise'
import { multiaddr } from '@multiformats/multiaddr'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'
import { http } from '../../dist/src/index.js'
import { sendPing } from '../../dist/src/ping.js'

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
  await sendPing(node, multiaddr(serverMA))
  for (let i = 0; i < 3; i++) {
    const start = new Date().getTime()
    await sendPing(node, serverMA)
    const end = new Date().getTime()
    console.error("Got response! took", end - start, "ms")
    console.log(end - start)
    // sleep 1s
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
} finally {
  await node.stop()
}
