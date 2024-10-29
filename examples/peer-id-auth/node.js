/* eslint-disable no-console */

import { serve } from '@hono/node-server'
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'
import { ClientAuth, HTTPPeerIDAuthProto, ServerAuth } from '@libp2p/http-fetch/auth.js'
import { WellKnownHandler, WELL_KNOWN_PROTOCOLS } from '@libp2p/http-fetch/well-known-handler.js'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { Hono } from 'hono'

const myID = await createEd25519PeerId()
const privKey = await unmarshalPrivateKey(myID.privateKey)
const wellKnownHandler = new WellKnownHandler()

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === 'client') {
  // Client mode
  const client = new ClientAuth(privKey)
  const observedPeerID = await client.authenticateServer(fetch, 'localhost:8001', 'http://localhost:8001/auth')
  console.log('Server ID:', observedPeerID.toString())

  const authenticatedReq = new Request('http://localhost:8001/log-my-id', {
    headers: {
      Authorization: client.bearerAuthHeader('localhost:8001')
    }
  })
  await fetch(authenticatedReq)
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

app.all('/log-my-id', async (c) => {
  try {
    const id = await httpServerAuth.unwrapBearerToken('localhost:8001', c.req.header('Authorization'))
    console.log('Client ID:', id.toString())
  } catch (e) {
    console.error(e)
    return c.text(e.message, { status: 400 })
  }
  c.status(200)
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
