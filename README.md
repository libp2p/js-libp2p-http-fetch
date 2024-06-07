# @libp2p/http-fetch

[![libp2p.io](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)

> Implementation of WHATWG Fetch with support for multiaddr URIs and libp2p streams. Use HTTP in p2p networks.

<!--

!IMPORTANT!

Everything in this README between "# About" and "# Install" is automatically
generated and will be overwritten the next time the doc generator is run.

To make changes to this section, please update the @packageDocumentation section
of src/index.js or src/index.ts

To experiment with formatting, please run "npm run docs" from the root of this
repo and examine the changes made.

-->

# Install

TODO (need to publish this)

## Example

See the `examples/` for full examples of how to use the HTTP service.
```typescript
 import { createLibp2p } from 'libp2p'
 import { http } from '../dist/src/index.js'
 
 async function main () {
 const node = await createLibp2p({
     // other options ...
     services: {
       http: http()
     }
 })
 
 await node.start()
 
 // Make an http request to a libp2p peer
 let resp = await node.services.http.fetch('multiaddr:/dns4/localhost/tcp/1234')
 // Or a traditional HTTP request
 resp = await node.services.http.fetch('multiaddr:/dns4/example.com/tcp/443/tls/http')
 // And of course, you can use the fetch API as you normally would
 resp = await node.services.http.fetch('https://example.com')
 
 // This gives you the accessiblity of the fetch API with the flexibility of using a p2p network.
 }
 
 main()
```
