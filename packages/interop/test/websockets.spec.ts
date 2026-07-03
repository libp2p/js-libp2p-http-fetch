import { nodeServer } from '@libp2p/http-server'
import { createServer } from '@libp2p/http-server/node'
import { stop } from '@libp2p/interface'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import pDefer from 'p-defer'
import { createWebSocketServer } from './fixtures/create-websocket-server.ts'
import { getClient, getHTTPOverLibp2pHandler } from './fixtures/get-libp2p.ts'
import type { HTTP } from '@libp2p/http'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Libp2p } from 'libp2p'

interface Test {
  name: string
  startServer(): Promise<Multiaddr>
  stopServer(): Promise<void>
}

let listener: Libp2p<{ http: HTTP }>

const LIBP2P_SERVERS: Test[] = [{
  name: 'in-process server',
  startServer: async () => {
    const server = createWebSocketServer(createServer())

    listener = await getHTTPOverLibp2pHandler(nodeServer(server))
    return listener.getMultiaddrs()[0]
  },
  stopServer: async () => {
    await stop(listener)
  }
}, {
  name: 'ws/js',
  startServer: async () => {
    return multiaddr(process.env.LIBP2P_JS_WSS_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}, {
  name: 'ws/node:http',
  startServer: async () => {
    return multiaddr(process.env.LIBP2P_NODE_WSS_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}, {
  name: '@fastify/websocket/js',
  startServer: async () => {
    return multiaddr(process.env.LIBP2P_JS_FASTIFY_WS_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}, {
  name: '@fastify/websocket/node:http',
  startServer: async () => {
    return multiaddr(process.env.LIBP2P_NODE_FASTIFY_WS_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}]

for (const test of LIBP2P_SERVERS) {
  describe(`WebSockets over libp2p - ${test.name}`, () => {
    let client: Libp2p<{ http: HTTP }>
    let address: Multiaddr

    beforeEach(async () => {
      client = await getClient()
      address = await test.startServer()
    })

    afterEach(async () => {
      await stop(client)
      await test.stopServer()
    })

    it('should make an WebSocket request to echo', async () => {
      const deferred = pDefer<ArrayBuffer>()
      const message = 'This should be echoed'
      const socket = await client.services.http.connect(address.encapsulate('/http-path/echo'), {
        headers: {
          host: 'example.com'
        }
      })
      socket.addEventListener('error', (evt: any) => {
        deferred.reject(evt.error)
      })
      socket.addEventListener('close', () => {
        deferred.reject(new Error('Socket closed before message received'))
      })
      socket.addEventListener('message', (evt) => {
        deferred.resolve(evt.data)
      })
      socket.addEventListener('open', () => {
        socket.send(message)
      })

      expect(new TextDecoder().decode(await deferred.promise)).to.equal(message)
    })
  })
}

const HTTP_SERVERS: Test[] = [{
  name: 'ws',
  startServer: async () => {
    return multiaddr(process.env.WS_WSS_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}, {
  name: '@fastify/websocket',
  startServer: async () => {
    return multiaddr(process.env.WS_FASTIFY_MULTIADDR ?? '')
  },
  stopServer: async () => {

  }
}]

for (const test of HTTP_SERVERS) {
  describe(`libp2p over WebSockets - ${test.name}`, () => {
    let client: Libp2p<{ http: HTTP }>
    let address: Multiaddr
    let socket: WebSocket

    beforeEach(async () => {
      client = await getClient()
      address = await test.startServer()
    })

    afterEach(async () => {
      socket?.close()
      await stop(client)
      await test.stopServer()
    })

    it('should make an WebSocket request to echo', async () => {
      const deferred = pDefer<ArrayBuffer>()
      const message = 'This should be echoed'
      socket = await client.services.http.connect(address.encapsulate('/http-path/echo'), {
        headers: {
          host: 'example.com'
        }
      })
      socket.addEventListener('error', (evt: any) => {
        deferred.reject(evt.error)
      })
      socket.addEventListener('close', () => {
        deferred.reject(new Error('Socket closed before message received'))
      })
      socket.addEventListener('message', (evt) => {
        deferred.resolve(evt.data)
      })
      socket.addEventListener('open', () => {
        socket.send(message)
      })

      expect(new TextDecoder().decode(await deferred.promise)).to.equal(message)
    })
  })
}
