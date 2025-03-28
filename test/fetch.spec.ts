import { stop } from '@libp2p/interface'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { createServer } from '../src/http/index.js'
import { nodeServer } from '../src/servers/node.js'
import { getClient, getListener } from './fixtures/get-libp2p.js'
import { getServer } from './fixtures/get-server.js'
import type { HTTP } from '../src/index.js'
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
    const server = getServer(createServer)
    listener = await getListener(nodeServer(server))

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
  describe(`fetch - ${test.name}`, () => {
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

    it('should fetch GET', async () => {
      const response = await client.services.http.fetch(listenerMultiaddrs, {
        headers: {
          host: 'example.com'
        }
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal('Hello World!')
    })

    it('should fetch POST with string', async () => {
      const body = 'echo body'

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.equal(body)
    })

    it('should fetch POST with ArrayBuffer', async () => {
      const body = Uint8Array.from([0, 1, 2, 3, 4]).buffer

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(body)
    })

    it('should fetch POST with Blob', async () => {
      const body = Uint8Array.from([0, 1, 2, 3, 4]).buffer
      const blob = new Blob([body])

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body: blob
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(body)
    })

    it('should fetch POST with DataView', async () => {
      const body = Uint8Array.from([0, 1, 2, 3, 4]).buffer
      const view = new DataView(body)

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body: view
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(body)
    })

    it('should fetch POST with File', async () => {
      const body = Uint8Array.from([0, 1, 2, 3, 4]).buffer
      const file = new File([body], 'file.txt')

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body: file
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(body)
    })

    it('should fetch POST with FormData', async () => {
      const data = Uint8Array.from([0, 1, 2, 3, 4]).buffer
      const blob = new Blob([data])
      const body = new FormData()
      body.append('foo', 'bar')
      body.append('baz', blob)

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
    })

    it('should fetch POST with TypedArray', async () => {
      const body = Uint8Array.from([0, 1, 2, 3, 4])

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(body.buffer)
    })

    it('should fetch POST with URLSearchParams', async () => {
      const body = new URLSearchParams()
      body.set('foo', 'bar')
      body.set('baz', 'qux')

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
      await expect(response.text()).to.eventually.deep.equal(body.toString())
    })

    it('should fetch POST with ReadableStream', async () => {
      const buf = Uint8Array.from([0, 1, 2, 3, 4])
      const body = new ReadableStream({
        start (controller) {
          controller.enqueue(buf)
          controller.close()
        }
      })

      const response = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/echo')), {
        method: 'POST',
        headers: {
          host: 'example.com'
        },
        body
      })
      expect(response.status).to.equal(200)
      await expect(response.arrayBuffer()).to.eventually.deep.equal(buf.buffer)
    })
  })
}
