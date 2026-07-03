/* eslint-disable no-console */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { http } from '@libp2p/http'
import { tcp } from '@libp2p/tcp'
import { multiaddr } from '@multiformats/multiaddr'
import { createLibp2p } from 'libp2p'
import { fetch } from 'undici'

// Take the first argument as the path of the folder to add
const args = process.argv.slice(2)

// Example of how to use arguments
if (args.length === 0) {
  console.error('No argument provided')
  console.error('Usage: node client.js <serverAddress>')
  process.exit(1)
}

// turn the passed arg into a multiaddr
const addr = multiaddr(args[0])

const node = await createLibp2p({
  transports: [
    tcp()
  ],
  connectionEncrypters: [
    noise()
  ],
  streamMuxers: [
    yamux()
  ],
  services: {
    http: http()
  }
})

// this dispatcher will direct all requests to the passed PeerId/Multiaddr
const dispatcher = node.services.http.dispatcher(addr)

// make an HTTP request over libp2p
const res = await fetch('http://example.com', {
  dispatcher
})

console.info('GET', addr.toString(), res.status, res.statusText)
console.info(await res.text())
