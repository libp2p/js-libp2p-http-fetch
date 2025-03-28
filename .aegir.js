import { stop } from '@libp2p/interface'
import http from 'node:http'

function stoppableServer (server) {
  return {
    start: () => {},
    stop: () => {
      server.close()
      server.closeAllConnections()
    }
  }
}

async function startHTTPServer (server) {
  return new Promise((resolve, reject) => {
    server.on('listening', () => {
      const address = server.address()

      if (address == null || typeof address === 'string') {
        reject(new Error('Did not listen on port'))
        return
      }

      resolve(address.port)
    })
    server.on('error', err => {
      reject(err)
    })
    server.listen(0)
  })
}

/** @type {import('aegir').PartialOptions} */
export default {
  build: {
    bundlesizeMax: '24kB'
  },
  test: {
    before: async () => {
      const { createServer } = await import('./dist/src/http/index.js')
      const { nodeServer } = await import('./dist/src/servers/node.js')
      const { getListener } = await import('./dist/test/fixtures/get-libp2p.js')
      const { createHttp } = await import('./dist/test/fixtures/create-http.js')
      const { createFastifyHTTP } = await import('./dist/test/fixtures/create-fastify-http.js')
      const { createExpress } = await import('./dist/test/fixtures/create-express.js')
      const { createWss } = await import('./dist/test/fixtures/create-wss.js')
      const { createFastifyWebSocket } = await import('./dist/test/fixtures/create-fastify-websocket.js')
      const { getLibp2pOverHttpHandler } = await import('./dist/test/fixtures/get-libp2p-over-http-handler.js')

      // --- http-over-libp2p
      const jsHttpListener = await getListener(nodeServer(createHttp(createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const nodeHttpListener = await getListener(nodeServer(createHttp(http.createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const jsExpressListener = await getListener(nodeServer(createExpress(createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const nodeHttpExpressListener = await getListener(nodeServer(createExpress(http.createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const jsFastifyListener = await getListener(nodeServer(await createFastifyHTTP(createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const nodeHttpFastifyListener = await getListener(nodeServer(await createFastifyHTTP(http.createServer())), '/ip4/0.0.0.0/tcp/0/ws')

      // --- ws-over-libp2p
      const jsWssListener = await getListener(nodeServer(createWss(createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const nodeHttpWssListener = await getListener(nodeServer(createWss(http.createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const jsFastifyWsListener = await getListener(nodeServer(await createFastifyWebSocket(createServer())), '/ip4/0.0.0.0/tcp/0/ws')
      const nodeHttpFastifyWsListener = await getListener(nodeServer(await createFastifyWebSocket(http.createServer())), '/ip4/0.0.0.0/tcp/0/ws')

      // --- libp2p-over-http
      const libp2pOverHttpHandler = await getLibp2pOverHttpHandler()
      const express = createExpress(http.createServer(), libp2pOverHttpHandler.http)
      const nodeHttp = createHttp(http.createServer(), libp2pOverHttpHandler.http)
      const fastify = await createFastifyHTTP(http.createServer(), libp2pOverHttpHandler.http)

      // --- libp2p-over-ws
      const wss = createWss(http.createServer(), libp2pOverHttpHandler.http, libp2pOverHttpHandler.ws)
      const fastifyWs = await createFastifyWebSocket(http.createServer(), libp2pOverHttpHandler.http, libp2pOverHttpHandler.ws)

      return {
        // http-over-libp2p
        jsHttpListener,
        nodeHttpListener,
        jsExpressListener,
        nodeHttpExpressListener,
        jsFastifyListener,
        nodeHttpFastifyListener,

        // ws-over-libp2p
        jsWssListener,
        nodeHttpWssListener,
        jsFastifyWsListener,
        nodeHttpFastifyWsListener,

        // libp2p-over-http
        libp2pOverHttpHandler: libp2pOverHttpHandler.libp2p,
        nodeHttp: stoppableServer(nodeHttp),
        express: stoppableServer(express),
        fastify: stoppableServer(fastify),

        // libp2p-over-ws
        wss: stoppableServer(wss),
        fastifyWs: stoppableServer(fastifyWs),

        env: {
          // http-over-libp2p
          LIBP2P_JS_HTTP_MULTIADDR: jsHttpListener.getMultiaddrs()[0],
          LIBP2P_NODE_HTTP_MULTIADDR: nodeHttpListener.getMultiaddrs()[0],
          LIBP2P_JS_EXPRESS_MULTIADDR: jsExpressListener.getMultiaddrs()[0],
          LIBP2P_NODE_EXPRESS_MULTIADDR: nodeHttpExpressListener.getMultiaddrs()[0],
          LIBP2P_JS_FASTIFY_MULTIADDR: jsFastifyListener.getMultiaddrs()[0],
          LIBP2P_NODE_FASTIFY_MULTIADDR: nodeHttpFastifyListener.getMultiaddrs()[0],

          // ws-over-libp2p
          LIBP2P_JS_WSS_MULTIADDR: jsWssListener.getMultiaddrs()[0],
          LIBP2P_NODE_WSS_MULTIADDR: nodeHttpWssListener.getMultiaddrs()[0],
          LIBP2P_JS_FASTIFY_WS_MULTIADDR: jsFastifyWsListener.getMultiaddrs()[0],
          LIBP2P_NODE_FASTIFY_WS_MULTIADDR: nodeHttpFastifyWsListener.getMultiaddrs()[0],

          // libp2p-over-http
          HTTP_PEER_ID: `${libp2pOverHttpHandler.libp2p.peerId}`,
          HTTP_NODE_HTTP_MULTIADDR: `/ip4/127.0.0.1/tcp/${await startHTTPServer(nodeHttp)}/http`,
          HTTP_EXPRESS_MULTIADDR: `/ip4/127.0.0.1/tcp/${await startHTTPServer(express)}/http`,
          HTTP_FASTIFY_MULTIADDR: `/ip4/127.0.0.1/tcp/${await startHTTPServer(fastify)}/http`,

          // libp2p-over-ws
          WS_WSS_MULTIADDR: `/ip4/127.0.0.1/tcp/${await startHTTPServer(wss)}/http`,
          WS_FASTIFY_MULTIADDR: `/ip4/127.0.0.1/tcp/${await startHTTPServer(fastifyWs)}/http`
        }
      }
    },
    after: async (_, before) => {
      await stop(
        ...Object.values(before)
      )
    }
  }
}
