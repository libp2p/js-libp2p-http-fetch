import { nodeServer } from '@libp2p/http-server'
import { createServer } from '@libp2p/http-server/node'
import { stop } from '@libp2p/interface'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
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
    const server = createHttp(createServer())
    listener = await getHTTPOverLibp2pHandler(nodeServer(server))

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
  describe(`cookies - ${test.name}`, () => {
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

    it('should support cookies', async () => {
      const setResponse = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/set-cookies')), {
        headers: {
          host: 'test-with-cookies.com'
        },
        credentials: 'include'
      })
      expect(setResponse.status).to.equal(201)
      expect(setResponse.headers.get('set-cookie')).to.not.be.ok()

      const getResponse = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/get-cookies')), {
        headers: {
          host: 'test-with-cookies.com'
        },
        credentials: 'include'
      })
      expect(getResponse.status).to.equal(200)
      await expect(getResponse.json()).to.eventually.deep.equal([
        'cookie-1=value-1',
        'cookie-2=value-2'
      ])
    })

    it('should support ignoring cookies', async () => {
      const setResponse = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/set-cookies')), {
        headers: {
          host: 'test-without-cookies.com'
        },
        credentials: 'omit'
      })
      expect(setResponse.status).to.equal(201)
      expect(setResponse.headers.get('set-cookie')).to.not.be.ok()

      const getResponse = await client.services.http.fetch(listenerMultiaddrs.map(ma => ma.encapsulate('/http-path/get-cookies')), {
        headers: {
          host: 'test-without-cookies.com'
        },
        credentials: 'omit'
      })
      expect(getResponse.status).to.equal(200)
      await expect(getResponse.json()).to.eventually.deep.equal([])
    })
  })
}
