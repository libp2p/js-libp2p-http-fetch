import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import {unmarshalPrivateKey} from '@libp2p/crypto/keys'
import { createLibp2p } from 'libp2p'
import { WELL_KNOWN_PROTOCOLS, httpCustomServer } from '@libp2p/http-fetch'
import { PING_PROTOCOL_ID, servePing } from '@libp2p/http-fetch/ping.js'
import { ClientAuth, HTTPPeerIDAuthProto, ServerAuth } from '@libp2p/http-fetch/auth.js'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

const node = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
  start: false,
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000']
  },
  transports: [tcp()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()],
  services: {http: httpCustomServer({customHTTPHandler: app.fetch.bind(app)})}
})
const privKey = await unmarshalPrivateKey(node.peerId.privateKey)

// Read process args
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === 'client') {
  const client = new ClientAuth(privKey)
  const observedPeerID = await client.doMutualAuth(fetch, "localhost:8001", "http://localhost:8001/auth")
  console.log("Server ID:", observedPeerID.toString())
  process.exit(0)
}


const httpServerAuth = new ServerAuth(privKey, ["localhost:8001"])

app.get(WELL_KNOWN_PROTOCOLS, async (c) => {
  return node.services.http.serveWellKnownProtocols(c.req)
})
app.get('/my-app', (c) => c.text('Hono!'))
node.services.http.registerProtocol('/example-app/0.0.1', "/my-app")

// Register HTTP ping protocol
app.all('/auth', (c) => {
  return httpServerAuth.httpHandler(addHeadersProxy(c.req))
})
node.services.http.registerProtocol(HTTPPeerIDAuthProto, "/auth")

app.all('/ping', (c) => {
  return servePing(c.req)
})
node.services.http.registerProtocol(PING_PROTOCOL_ID, "/ping")

// start libp2p
await node.start()
console.error('libp2p has started')

// Also listen on a standard http transport
const server = serve({
  fetch: app.fetch,
  port: 8001,
  hostname: '127.0.0.1',
})

const listenAddrs = node.getMultiaddrs()
console.error('libp2p is listening on the following addresses:')
console.error(`/ip4/127.0.0.1/tcp/8001/http`)
for (const addr of listenAddrs) {
  console.error(addr.toString())
}
console.error("") // Empty line to signal we have no more addresses (for test runner)

console.log("Server ID:", node.peerId.toString())


// wait for SIGINT
await new Promise(resolve => process.on('SIGINT', resolve))

// Stop the http server
server.close()

// stop libp2p
node.stop()
console.error('libp2p has stopped')


function addHeadersProxy(req) {
    return new Proxy(req, {
        get: (target, prop) => {
            if (prop === 'headers') {
                return {
                    get: (header) => {
                        return req.header(header)
                    }
                }
            }
            return target[prop]
        }
    })
}
