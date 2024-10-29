/* eslint-disable no-console */

import { serve } from '@hono/node-server'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { ClientAuth, HTTPPeerIDAuthProto, ServerAuth } from '@libp2p/http-fetch/auth'
import { WellKnownHandler, WELL_KNOWN_PROTOCOLS } from '@libp2p/http-fetch/well-known-handler'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { Hono } from 'hono'

const privKey = await generateKeyPair('Ed25519')
const myID = peerIdFromPrivateKey(privKey)
const wellKnownHandler = new WellKnownHandler()

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === 'client') {
  // Client mode
  const client = new ClientAuth(privKey)
  const { peer: serverID } = await client.authenticatedFetch(new Request('http://localhost:8001/log-my-id'), (id) => true)
  console.log('Server ID:', serverID.toString())
  console.log('Client ID:', myID.toString())
  process.exit(0)
}
// Server mode

const httpServerAuth = new ServerAuth(privKey, (_) => true, { logger: console })

const app = new Hono()
app.get(WELL_KNOWN_PROTOCOLS, async (c) => {
  return wellKnownHandler.handleRequest(c.req)
})

// Register HTTP ping protocol
app.all('/auth', (c) => {
  return httpServerAuth.httpHandler(addHeadersProxy(c.req))
})
wellKnownHandler.registerProtocol(HTTPPeerIDAuthProto, '/auth')

const logMyIDHandler = httpServerAuth.withAuth(async (clientId, req) => {
  console.log('Client ID:', clientId.toString())
  return new Response('', { status: 200 })
})

app.all('/log-my-id', async (c) => {
  return logMyIDHandler(addHeadersProxy(c.req))
})
wellKnownHandler.registerProtocol('/log-my-id/1', '/log-my-id')

const server = serve({
  fetch: app.fetch,
  port: 8001,
  hostname: '127.0.0.1'
})

console.log('Server ID:', myID.toString())

// wait for SIGINT
await new Promise(resolve => process.on('SIGINT', resolve))

// Stop the http server
server.close()

// Proxy helper to handle the difference in how the standard Request type
// exposes headers and how hono's Request type exposes headers.
// The standard Request type exposes headers as a Headers object, while
// hono's Request type has a function `header(name: string): string | null` to get the header
function addHeadersProxy (req) {
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
