# @libp2p/http-fetch

[![libp2p.io](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![Discuss](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg?style=flat-square)](https://discuss.libp2p.io)
[![codecov](https://img.shields.io/codecov/c/github/libp2p/js-libp2p-http-fetch.svg?style=flat-square)](https://codecov.io/gh/libp2p/js-libp2p-http-fetch)
[![CI](https://img.shields.io/github/actions/workflow/status/libp2p/js-libp2p-http-fetch/js-test-and-release.yml?branch=main\&style=flat-square)](https://github.com/libp2p/js-libp2p-http-fetch/actions/workflows/js-test-and-release.yml?query=branch%3Amain)

> Accept HTTP requests over libp2p streams or use libp2p protocols over HTTP

# About

<!--

!IMPORTANT!

Everything in this README between "# About" and "# Install" is automatically
generated and will be overwritten the next time the doc generator is run.

To make changes to this section, please update the @packageDocumentation section
of src/index.js or src/index.ts

To experiment with formatting, please run "npm run docs" from the root of this
repo and examine the changes made.

-->

This module allows you to use HTTP requests as a transport for libp2p
protocols (libp2p over HTTP), and also libp2p streams as a transport for HTTP
requests (HTTP over libp2p).

It integrates with existing Node.js friendly HTTP frameworks such as
[express](https://expressjs.com/) and [Fastify](https://fastify.dev) as well
as [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request)/
[Response](https://developer.mozilla.org/en-US/docs/Web/API/Response)-based
frameworks like [Hono](https://hono.dev/).

It even allows creating Node.js-style [http.Server](https://nodejs.org/api/http.html#class-httpserver)s
and [WebSocketServer](https://github.com/websockets/ws/blob/HEAD/doc/ws.md#class-websocketserver)s
(based on the [ws](https://www.npmjs.com/package/ws) module API in the
absence of a native Node.js API to emulate) in browsers to truly realize the
power of the distributed web.

Instead of the regular "host:port" addressing, it uses a libp2p PeerId and/or
multiaddr(s) and lets libp2p take care of the routing, thus taking advantage
of features like multi-routes, NAT transversal and stream multiplexing over a
single connection.

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@libp2p/http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'

const client = await createLibp2p({
  // ...other options
  services: {
    http: http()
  }
})

const peerId = peerIdFromString('12DKoo')
const ma = multiaddr(`/p2p/${peerId}/http`)
const response = await client.services.httpClient.fetch(ma, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@libp2p/http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@libp2p/http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@libp2p/http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'

const client = await createLibp2p({
  // ...other options
  services: {
    http: http()
  }
})

const peerId = peerIdFromString('12DKoo')
const ma = multiaddr(`/p2p/${peerId}/http`)
const response = await client.services.httpClient.fetch(ma, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@libp2p/http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@libp2p/http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@libp2p/http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server)
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server))
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http'
import { nodeServer } from '@libp2p/http/servers/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: http({
      server: nodeServer(server))
    })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Servers

You can create HTTP and WebSocket servers using the framework of your choice,
as long as it accepts a Node.js `http.Server` instance.

## Example - Node HTTP server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@libp2p/libp2p-http'
import { nodeServer } from '@libp2p/libp2p-http/node'
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    http: httpServer({ server: nodeServer(server) })
  }
})
```

## Example - Express server

```ts
import express from 'express'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

// create an express app
const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = createServer(app)

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - Fastify server

```ts
import { fastify } from 'fastify'
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'

let server

// create a fastify app
const app = fastify({
  serverFactory: (handler, opts) => {
    server = createServer((req, res) => {
      handler(req, res)
     })

     return server
   }
 })
app.get('/', async (req, res) => {
  await res.send('Hello World!')
})
await app.ready()

if (server == null) {
   throw new Error('Server not created')
 }

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - ws WebSocket server

```ts
import { createLibp2p } from 'libp2p'
import { httpServer } from '@ipshipyard/libp2p-http'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Clients

You can use the built-in `.fetch` and `.connect` methods to make HTTP or
WebSocket requests respectively, or you can create a Node.js `http.Agent` for
use with the `node:http`, or a `Dispatcher` for use with `undici`.

## Example - Using fetch to make a HTTP request

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const response = await client.services.httpClient.fetch(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

## Example - Using connect to create a WebSocket

This example works in all JavaScript environments, Node.js and browsers too!

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')
const webSocket = await client.services.httpClient.connect(peerId, url, {
  signal: AbortSignal.timeout(10_000)
})

webSocket.addEventListener('message', (evt) => {
  console.info(response.data)
  // <Uint8Array>
})
```

## Example - Using a http.Agent to make a request with node:http

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import * as http from 'node:http'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const agent = client.services.httpClient.agent(peerId)

const req = http.request({ host: 'example.com', agent }, (res) => {
  let result = ''

  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    result += chunk
  })
  res.on('end', () => {
    console.info(result)
    // Hello world!
  })
})

req.end()
```

## Example - Using a Dispatcher to make a request with undici

This example only works in Node.js-compatible environments.

```ts
import { createLibp2p } from 'libp2p'
import { httpClient } from '@ipshipyard/libp2p-http'
import { peerIdFromString } from '@libp2p/peer-id'
import { fetch } from 'undici'

const client = await createLibp2p({
  // ...other options
  services: {
    httpClient: httpClient()
  }
})

const peerId = peerIdFromString('12DKoo')
const url = new URL('http://example.com')

const dispatcher = client.services.httpClient.dispatcher(peerId)
const response = await fetch(url, {
  dispatcher,
  signal: AbortSignal.timeout(10_000)
})

console.info('Response:', response.status)
// Response: 200

console.info(await response.text())
// Hello world!
```

# Browsers

Making requests to servers is all good and well, but what if you could also
run a web or WebSocket server in a browser?

## Example - A HTTP server running in a browser

Once configured you can make requests to this server in the same was as the
fetch example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer } from '@ipshipyard/libp2p-http'

const server = createServer((req, res) => {
  req.end('Hello world!')
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

## Example - A WebSocket server running in a browser

Once configured you can make requests to this server in the same was as the
WebSocket example near the top of this README.

```ts
import { createLibp2p } from 'libp2p'
import { httpServer, createServer, createWebSocketServer } from '@ipshipyard/libp2p-http'

const wss = createWebSocketServer()
wss.addEventListener('connection', (evt) => {
  const ws = evt.webSocket

  ws.on('message', (data) => {
    ws.send(data)
  })
})

const server = createServer((req, res) => {
  req.end('Hello world!')
})

server.addListener('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const listener = await createLibp2p({
  // ...other options
  services: {
    httpServer: httpServer({ server })
  }
})
```

# Install

```console
$ npm i @libp2p/http-fetch
```

## Browser `<script>` tag

Loading this module through a script tag will make its exports available as `Libp2pHttpFetch` in the global namespace.

```html
<script src="https://unpkg.com/@libp2p/http-fetch/dist/index.min.js"></script>
```

# API Docs

- <https://libp2p.github.io/js-libp2p-http-fetch>

# License

Licensed under either of

- Apache 2.0, ([LICENSE-APACHE](https://github.com/libp2p/js-libp2p-http-fetch/LICENSE-APACHE) / <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT ([LICENSE-MIT](https://github.com/libp2p/js-libp2p-http-fetch/LICENSE-MIT) / <http://opensource.org/licenses/MIT>)

# Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
