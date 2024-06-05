import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'
import { http } from '../../dist/src/index.js'
import { PING_PROTOCOL_ID, servePing } from '../../dist/src/ping.js'

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000']
  },
  transports: [tcp()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()],
  services: {http: http()}
})

// start libp2p
await node.start()
console.error('libp2p has started')

const listenAddrs = node.getMultiaddrs()
console.error('libp2p is listening on the following address:')
console.log(listenAddrs[0].toString())

node.services.http.handleHTTPProtocol(PING_PROTOCOL_ID, '/ping', servePing)

// sleep 100s
await new Promise(resolve => setTimeout(resolve, 100000))

// stop libp2p
await node.stop()
console.error('libp2p has stopped')

