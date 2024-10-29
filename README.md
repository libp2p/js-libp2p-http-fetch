# @libp2p/http-fetch

[![libp2p.io](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![Discuss](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg?style=flat-square)](https://discuss.libp2p.io)
[![codecov](https://img.shields.io/codecov/c/github/libp2p/js-libp2p-http-fetch.svg?style=flat-square)](https://codecov.io/gh/libp2p/js-libp2p-http-fetch)
[![CI](https://img.shields.io/github/actions/workflow/status/libp2p/js-libp2p-http-fetch/js-test-and-release.yml?branch=main\&style=flat-square)](https://github.com/libp2p/js-libp2p-http-fetch/actions/workflows/js-test-and-release.yml?query=branch%3Amain)

> Implementation of the WHATWG Fetch API on libp2p streams

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

http implements the WHATWG [Fetch
api](https://fetch.spec.whatwg.org). It can be used as a drop in replacement
for the browser's fetch function. It supports http, https, and multiaddr
URIs. Use HTTP in p2p networks.

## Example

See the `examples/` for full examples of how to use the HTTP service.

```typescript
import { createLibp2p } from 'libp2p'
import { http } from '@libp2p/http-fetch'

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

// This gives you the accessibility of the fetch API with the flexibility of using a p2p network.
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
