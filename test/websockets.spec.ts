import { stop } from '@libp2p/interface'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { createServer } from '../src/http/index.js'
import { nodeServer } from '../src/servers/node.js'
import { createWebSocketServer } from './fixtures/create-websocket-server.js'
import { getClient, getListener } from './fixtures/get-libp2p.js'
import type { HTTP } from '../src/index.js'
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

    listener = await getListener(nodeServer(server))
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

    it('should make an WebSocket request to echo', (cb) => {
      const message = 'This should be echoed'
      const socket = client.services.http.connect(address.encapsulate('/http-path/echo'), [], {
        headers: {
          host: 'example.com'
        }
      })
      socket.addEventListener('error', (evt: any) => {
        cb(evt.error)
      })
      socket.addEventListener('message', (evt) => {
        expect(evt.data).to.equalBytes(uint8ArrayFromString(message))
        cb()
      })
      socket.addEventListener('open', () => {
        socket.send(message)
      })
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

    it('should make an WebSocket request to echo', (cb) => {
      const message = 'This should be echoed'
      socket = client.services.http.connect(address.encapsulate('/http-path/echo'), [], {
        headers: {
          host: 'example.com'
        }
      })
      socket.addEventListener('error', (evt: any) => {
        cb(evt.error)
      })
      socket.addEventListener('message', (evt) => {
        expect(new Uint8Array(evt.data)).to.equalBytes(uint8ArrayFromString(message))
        cb()
      })
      socket.addEventListener('open', () => {
        socket.send(message)
      })
    })
  })
}
