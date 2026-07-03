# Examples of using libp2p+http

## HTTP over libp2p

These examples involve starting a libp2p node and having it provide the
networking layer for a HTTP server.

With this configuration you can use libp2p for peer routing, NAT traversal and
other features, but define your own web application server in the framework you
are most familiar with.

- [Express server over libp2p](./express-server-over-libp2p)
- [Hono server over libp2p](./hono-server-over-libp2p)
- [WebSockets over libp2p](./websockets-over-libp2p)
- [libp2p as a HTTP transport]('./libp2p-as-http-transport)

## libp2p over HTTP

These examples start a HTTP server and then pass incoming requests to libp2p.

- [libp2p over http.Server](./libp2p-over-http-server)

## Other features

- [PeerID authentication](./peer-id-auth)
- [Serving websites from browsers](./serving-websites-from-browsers)
