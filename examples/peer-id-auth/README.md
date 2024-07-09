# HTTP Peer ID Auth

This folder contains a simple HTTP server and client that in both Go and JS that
will run the HTTP Peer ID Auth protocol to mutually authenticate the client and
server's peer ID.

Use this as an example for how to authenticate your server to libp2p clients (or
any client that wants to authenticate a peer id). You can also use this to
authenticate your client's peer id to a libp2p+HTTP server.

## Tests

There is a simple tests that makes sure authentication works using a Go
{client,server} and a NodeJS {client,server}. In lieu, of a larger interop test
environment, this serves for now (pun intended).
