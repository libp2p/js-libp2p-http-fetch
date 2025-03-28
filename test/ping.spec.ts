/* eslint-env mocha */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { NotFoundError, peerRoutingSymbol, stop } from '@libp2p/interface'
import { memory } from '@libp2p/memory'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { createLibp2p } from 'libp2p'
import { http } from '../src/index.js'
import { pingHTTP } from '../src/ping/index.js'
import type { HTTP } from '../src/index.js'
import type { PingHTTP } from '../src/ping/index.js'
import type { Libp2p, PeerId, PeerInfo } from '@libp2p/interface'

describe('pingHTTP', () => {
  let client: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>
  let listener: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>

  beforeEach(async () => {
    listener = await createLibp2p({
      addresses: {
        listen: [
          '/memory/address-1'
        ]
      },
      transports: [
        memory()
      ],
      streamMuxers: [
        yamux()
      ],
      connectionEncrypters: [
        noise()
      ],
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      }
    })

    client = await createLibp2p({
      transports: [
        memory()
      ],
      streamMuxers: [
        yamux()
      ],
      connectionEncrypters: [
        noise()
      ],
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      },
      peerRouters: [
        () => {
          const routing: any = {
            async findPeer (peerId: PeerId): Promise<PeerInfo> {
              if (peerId.equals(listener.peerId)) {
                return {
                  id: listener.peerId,
                  multiaddrs: listener.getMultiaddrs()
                }
              }

              throw new NotFoundError()
            },
            async * getClosestPeers () {}
          }
          routing[peerRoutingSymbol] = routing

          return routing
        }
      ]
    })
  })

  afterEach(async () => {
    await stop(client, listener)
  })

  it('should perform ping with multiaddr', async () => {
    await expect(client.services.pingHTTP.ping(listener.getMultiaddrs()[0])).to.eventually.be.a('number')
  })

  it('should perform ping with multiaddrs', async () => {
    await expect(client.services.pingHTTP.ping(listener.getMultiaddrs())).to.eventually.be.a('number')
  })

  it('should perform ping with a peer id', async () => {
    await expect(client.services.pingHTTP.ping(listener.peerId)).to.eventually.be.a('number')
  })
})

const LIBP2P_SERVERS = [{
  name: 'node:http',
  address: multiaddr(process.env.LIBP2P_JS_HTTP_MULTIADDR)
}, {
  name: 'js',
  address: multiaddr(process.env.LIBP2P_NODE_HTTP_MULTIADDR)
}, {
  name: 'express/js',
  address: multiaddr(process.env.LIBP2P_JS_EXPRESS_MULTIADDR)
}, {
  name: 'express/node:http',
  address: multiaddr(process.env.LIBP2P_NODE_EXPRESS_MULTIADDR)
}, {
  name: 'fastify/js',
  address: multiaddr(process.env.LIBP2P_JS_FASTIFY_MULTIADDR)
}, {
  name: 'fastify/node:http',
  address: multiaddr(process.env.LIBP2P_NODE_FASTIFY_MULTIADDR)
}]

describe('ping - HTTP over libp2p', () => {
  let client: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>

  beforeEach(async () => {
    client = await createLibp2p({
      transports: [
        webSockets()
      ],
      streamMuxers: [
        yamux()
      ],
      connectionEncrypters: [
        noise()
      ],
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      }
    })
  })

  afterEach(async () => {
    await stop(client)
  })

  LIBP2P_SERVERS.forEach(test => {
    it(`should perform ping with ${test.name} server`, async () => {
      await expect(client.services.pingHTTP.ping(multiaddr(test.address))).to.eventually.be.a('number')
    })

    it('should perform ping with multiaddrs', async () => {
      await expect(client.services.pingHTTP.ping(multiaddr(test.address))).to.eventually.be.a('number')
    })

    it('should perform ping with a peer id', async () => {
      await expect(client.services.pingHTTP.ping(multiaddr(test.address))).to.eventually.be.a('number')
    })
  })
})

const HTTP_SERVERS = [{
  name: 'node:http',
  address: multiaddr(process.env.HTTP_NODE_HTTP_MULTIADDR)
}, {
  name: 'express',
  address: multiaddr(process.env.HTTP_EXPRESS_MULTIADDR)
}, {
  name: 'fastify',
  address: multiaddr(process.env.HTTP_FASTIFY_MULTIADDR)
}]

describe('ping - libp2p over HTTP', () => {
  let client: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>

  beforeEach(async () => {
    client = await createLibp2p({
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      }
    })
  })

  afterEach(async () => {
    await stop(client)
  })

  HTTP_SERVERS.forEach(test => {
    it(`should perform ping with the HTTP address of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address)

      await expect(client.services.pingHTTP.ping(httpAddr)).to.eventually.be.a('number')
    })

    it(`should perform ping with a HTTP address with a peer id of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${process.env.HTTP_PEER_ID}`)

      await expect(client.services.pingHTTP.ping(httpAddr)).to.eventually.be.a('number')
    })

    it.skip(`should reject when performing ping with a HTTP address with the wrong peer id of a ${test.name} server`, async () => {
      // TODO: detect PeerID in HTTP multiaddr and apply peer id auth
      // https://github.com/libp2p/specs/blob/master/http/peer-id-auth.md
      const privateKey = await generateKeyPair('Ed25519')
      const peerId = peerIdFromPrivateKey(privateKey)

      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${peerId}`)

      await expect(client.services.pingHTTP.ping(httpAddr)).to.eventually.be.rejected
        .with.property('name', 'InvalidPeerIdError')
    })
  })
})

const WS_SERVERS = [{
  name: 'ws',
  address: multiaddr(process.env.WS_WSS_MULTIADDR)
}, {
  name: '@fastify/websocket',
  address: multiaddr(process.env.WS_FASTIFY_MULTIADDR)
}]

describe('ping - libp2p over WebSockets', () => {
  let client: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>

  beforeEach(async () => {
    client = await createLibp2p({
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      }
    })
  })

  afterEach(async () => {
    await stop(client)
  })

  WS_SERVERS.forEach(test => {
    it(`should perform ping with the HTTP address of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.a('number')
    })

    it(`should perform ping with a HTTP address with a peer id of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${process.env.HTTP_PEER_ID}`)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.a('number')
    })

    it.skip(`should reject when performing ping with a HTTP address with the wrong peer id of a ${test.name} server`, async () => {
      // TODO: detect PeerID in HTTP multiaddr and apply peer id auth
      // https://github.com/libp2p/specs/blob/master/http/peer-id-auth.md
      const privateKey = await generateKeyPair('Ed25519')
      const peerId = peerIdFromPrivateKey(privateKey)

      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${peerId}`)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.rejected
        .with.property('name', 'InvalidPeerIdError')
    })
  })
})

const LIBP2P_WS_SERVERS = [{
  name: 'ws/js',
  address: multiaddr(process.env.LIBP2P_JS_WSS_MULTIADDR)
}, {
  name: 'ws/node:http',
  address: multiaddr(process.env.LIBP2P_NODE_WSS_MULTIADDR)
}, {
  name: '@fastify/websocket/js',
  address: multiaddr(process.env.LIBP2P_JS_FASTIFY_WS_MULTIADDR)
}, {
  name: '@fastify/websocket/node:http',
  address: multiaddr(process.env.LIBP2P_NODE_FASTIFY_WS_MULTIADDR)
}]

describe('ping - WebSockets over libp2p', () => {
  let client: Libp2p<{ http: HTTP, pingHTTP: PingHTTP }>

  beforeEach(async () => {
    client = await createLibp2p({
      transports: [
        webSockets()
      ],
      streamMuxers: [
        yamux()
      ],
      connectionEncrypters: [
        noise()
      ],
      services: {
        http: http(),
        pingHTTP: pingHTTP()
      }
    })
  })

  afterEach(async () => {
    await stop(client)
  })

  LIBP2P_WS_SERVERS.forEach(test => {
    it(`should perform ping with the HTTP address of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.a('number')
    })
  })
})
