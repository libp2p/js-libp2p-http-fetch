import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { memory } from '@libp2p/memory'
import { ping } from '@libp2p/ping'
import { webSockets } from '@libp2p/websockets'
import { createLibp2p } from 'libp2p'
import { http } from '../../src/index.js'
import { pingHTTP } from '../../src/ping/index.js'
import type { Endpoint, HTTP } from '../../src/index.js'
import type { Libp2p } from '@libp2p/interface'

export async function getListener (server: Endpoint, listen: string = '/memory/address-1'): Promise<Libp2p<{ http: HTTP }>> {
  return createLibp2p({
    addresses: {
      listen: [
        listen
      ]
    },
    transports: [
      webSockets(),
      memory()
    ],
    connectionEncrypters: [
      noise()
    ],
    streamMuxers: [
      yamux()
    ],
    services: {
      http: http({ server }),
      ping: ping(),
      pingHTTP: pingHTTP()
    },
    connectionManager: {
      inboundConnectionThreshold: Infinity
    }
  })
}

export async function getClient (): Promise<Libp2p<{ http: HTTP }>> {
  return createLibp2p({
    transports: [
      webSockets(),
      memory()
    ],
    connectionEncrypters: [
      noise()
    ],
    streamMuxers: [
      yamux()
    ],
    services: {
      http: http(),
      ping: ping(),
      pingHTTP: pingHTTP()
    }
  })
}
