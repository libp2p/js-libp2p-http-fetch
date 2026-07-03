/* eslint-disable max-nested-callbacks */

import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { http } from '@libp2p/http'
import { peerIdAuth } from '@libp2p/http/middleware'
import { pingHTTP } from '@libp2p/http-ping'
import { stop } from '@libp2p/interface'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { webSockets } from '@libp2p/websockets'
import { CODE_P2P, multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { createLibp2p } from 'libp2p'
import sinon from 'sinon'
import type { HTTP } from '@libp2p/http'
import type { PingHTTP } from '@libp2p/http-ping'
import type { Libp2p } from '@libp2p/interface'

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
      },
      connectionGater: {
        denyDialMultiaddr: () => false
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
      const verifyPeer = sinon.stub().callsFake((peerId) => {
        return peerId.equals(httpAddr.getComponents().findLast(c => c.code === CODE_P2P)?.value)
      })

      await expect(client.services.pingHTTP.ping(httpAddr, {
        middleware: [
          peerIdAuth({
            verifyPeer
          })
        ]
      })).to.eventually.be.a('number')

      expect(verifyPeer).to.have.property('called', true)
    })

    it(`should reject when performing ping with a HTTP address with the wrong peer id of a ${test.name} server`, async () => {
      const privateKey = await generateKeyPair('Ed25519')
      const peerId = peerIdFromPrivateKey(privateKey)

      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${peerId}`)
      const verifyPeer = sinon.stub().callsFake((peerId) => {
        return peerId.equals(httpAddr.getComponents().findLast(c => c.code === CODE_P2P)?.value)
      })

      await expect(client.services.pingHTTP.ping(httpAddr, {
        middleware: [
          peerIdAuth({
            verifyPeer
          })
        ]
      })).to.eventually.be.rejected
        .with.property('name', 'InvalidPeerError')

      expect(verifyPeer).to.have.property('called', true)
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
    it(`should perform ping with the WebSocket address of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.a('number')
    })

    it(`should perform ping with a WebSocket address with a peer id of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${process.env.HTTP_PEER_ID}`)
      const verifyPeer = sinon.stub().callsFake((peerId) => {
        return peerId.equals(httpAddr.getComponents().findLast(c => c.code === CODE_P2P)?.value)
      })

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true,
        middleware: [
          peerIdAuth({
            verifyPeer
          })
        ]
      })).to.eventually.be.a('number')

      expect(verifyPeer).to.have.property('called', true)
    })

    it(`should reject when performing ping with a WebSocket address with the wrong peer id of a ${test.name} server`, async () => {
      const privateKey = await generateKeyPair('Ed25519')
      const peerId = peerIdFromPrivateKey(privateKey)

      const httpAddr = multiaddr(test.address).encapsulate(`/p2p/${peerId}`)
      const verifyPeer = sinon.stub().callsFake((peerId) => {
        return peerId.equals(httpAddr.getComponents().findLast(c => c.code === CODE_P2P)?.value)
      })

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true,
        middleware: [
          peerIdAuth({
            verifyPeer
          })
        ]
      })).to.eventually.be.rejected
        .with.property('name', 'InvalidPeerError')

      expect(verifyPeer).to.have.property('called', true)
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
      },
      connectionGater: {
        denyDialMultiaddr: () => false
      }
    })
  })

  afterEach(async () => {
    await stop(client)
  })

  LIBP2P_WS_SERVERS.forEach(test => {
    it(`should perform ping with the WebSocket address of a ${test.name} server`, async () => {
      const httpAddr = multiaddr(test.address)

      await expect(client.services.pingHTTP.ping(httpAddr, {
        webSocket: true
      })).to.eventually.be.a('number')
    })
  })
})
