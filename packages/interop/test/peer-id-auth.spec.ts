import { peerIdAuth } from '@libp2p/http/middleware'
import { nodeServer } from '@libp2p/http-server'
import { createServer } from '@libp2p/http-server/node'
import { stop } from '@libp2p/interface'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import pDefer from 'p-defer'
import { pEvent } from 'p-event'
import { createHttp } from './fixtures/create-http.ts'
import { getClient, getHTTPOverLibp2pHandler } from './fixtures/get-libp2p.ts'
import type { HTTP } from '@libp2p/http'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Libp2p } from 'libp2p'

interface Test {
  name: string
  startServer(): Promise<Multiaddr[]>
  stopServer(): Promise<void>
}

let listener: Libp2p<{ http: HTTP }>

const tests: Test[] = [{
  name: 'in-process server',
  startServer: async () => {
    listener = await getHTTPOverLibp2pHandler(nodeServer(createHttp(createServer())))

    return listener.getMultiaddrs()
  },
  stopServer: async () => {
    await stop(listener)
  }
}, {
  name: 'js',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_JS_HTTP_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}, {
  name: 'node:http',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_NODE_HTTP_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}, {
  name: 'express/js',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_JS_EXPRESS_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}, {
  name: 'express/node:http',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_NODE_EXPRESS_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}, {
  name: 'fastify/js',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_JS_FASTIFY_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}, {
  name: 'fastify/node:http',
  startServer: async () => {
    return [
      multiaddr(process.env.LIBP2P_NODE_FASTIFY_MULTIADDR ?? '')
    ]
  },
  stopServer: async () => {

  }
}]

for (const test of tests) {
  describe(`peer id auth - HTTP over libp2p - ${test.name}`, () => {
    let client: Libp2p<{ http: HTTP }>
    let listenerMultiaddrs: Multiaddr[]

    beforeEach(async () => {
      client = await getClient()
      listenerMultiaddrs = await test.startServer()
    })

    afterEach(async () => {
      await stop(client)
      await test.stopServer()
    })

    it('should support peer id auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should support optional peer id auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should support optional peer id auth without auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        }
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal('no-peer-id')
    })

    it('should support WebSocket peer id auth', async () => {
      const deferred = pDefer<string>()
      const socket = await client.services.http.connect(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })

      if (socket.readyState !== WebSocket.OPEN) {
        await pEvent(socket, 'open')
      }

      socket.addEventListener('error', (evt: any) => {
        deferred.reject(evt.error)
      })
      socket.addEventListener('close', () => {
        deferred.reject(new Error('Socket closed before message received'))
      })
      socket.addEventListener('message', (evt) => {
        deferred.resolve(new TextDecoder().decode(evt.data))
      })

      await expect(deferred.promise).to.eventually.equal(client.peerId.toString())
    })

    it('should support WebSocket optional peer id auth', async () => {
      const deferred = pDefer<string>()
      const socket = await client.services.http.connect(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })

      if (socket.readyState !== WebSocket.OPEN) {
        await pEvent(socket, 'open')
      }

      socket.addEventListener('error', (evt: any) => {
        deferred.reject(evt.error)
      })
      socket.addEventListener('close', () => {
        deferred.reject(new Error('Socket closed before message received'))
      })
      socket.addEventListener('message', (evt) => {
        deferred.resolve(new TextDecoder().decode(evt.data))
      })

      await expect(deferred.promise).to.eventually.equal(client.peerId.toString())
    })

    it('should support WebSocket optional peer id auth without auth', async () => {
      const deferred = pDefer<string>()
      const socket = await client.services.http.connect(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        }
      })

      if (socket.readyState !== WebSocket.OPEN) {
        await pEvent(socket, 'open')
      }

      socket.addEventListener('error', (evt: any) => {
        deferred.reject(evt.error)
      })
      socket.addEventListener('close', () => {
        deferred.reject(new Error('Socket closed before message received'))
      })
      socket.addEventListener('message', (evt) => {
        deferred.resolve(new TextDecoder().decode(evt.data))
      })

      await expect(deferred.promise).to.eventually.equal('no-peer-id')
    })

    it('should fall back to HTTP on WebSocket route with peer id auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should fall back to HTTP on WebSocket route with optional peer id auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should fall back to HTTP on WebSocket route with optional peer id auth without auth', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/ws-optional-peer-id')}`)), {
        headers: {
          host: 'test-with-auth.com'
        }
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal('no-peer-id')
    })
  })
}

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

HTTP_SERVERS.forEach(test => {
  describe(`peer id auth - libp2p over HTTP - ${test.name}`, () => {
    let client: Libp2p<{ http: HTTP }>
    let httpAddr: Multiaddr

    beforeEach(async () => {
      client = await getClient()
      httpAddr = multiaddr(test.address)
    })

    afterEach(async () => {
      await stop(client)
    })

    it('should support peer id auth', async () => {
      const response = await client.services.http.fetch(httpAddr.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/peer-id')}`), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should support optional peer id auth', async () => {
      const response = await client.services.http.fetch(httpAddr.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/optional-peer-id')}`), {
        headers: {
          host: 'test-with-auth.com'
        },
        middleware: [
          peerIdAuth()
        ]
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(client.peerId.toString())
    })

    it('should support optional peer id auth without auth', async () => {
      const response = await client.services.http.fetch(httpAddr.encapsulate(`/http-path/${encodeURIComponent('libp2p/http/optional-peer-id')}`), {
        headers: {
          host: 'test-with-auth.com'
        }
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal('no-peer-id')
    })
  })
})
