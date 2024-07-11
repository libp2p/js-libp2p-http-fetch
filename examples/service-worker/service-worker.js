/* eslint-disable no-console */
import { noise } from '@chainsafe/libp2p-noise'
import { http } from '@libp2p/http-fetch'
import { webTransport } from '@libp2p/webtransport'
import { createLibp2p } from 'libp2p'

let libp2pNode

async function getLibp2pNode () {
  if (libp2pNode !== undefined) {
    return libp2pNode
  }
  libp2pNode = await createLibp2p({
  // libp2p nodes are started by default, pass false to override this
    transports: [webTransport()],
    connectionEncryption: [noise()],
    connectionGater: {
      denyDialMultiaddr: async () => false
    },
    services: { http: http() }
  })
  await libp2pNode.start()
  return libp2pNode
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.onactivate = (event) => {
  event.waitUntil(
    (async () => {
      await getLibp2pNode()
      // eslint-disable-next-line no-undef
      await clients.claim()
    })())
}

function unwrapMultiaddrURI (url) {
  // Unwraps a url of the form http://example.com/#<multiaddr-uri> example: http://example.com/#multiaddr:/ip4/...
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return null
  }
  if (url.substring(hashIndex + 1).startsWith('multiaddr:')) {
    return url.substring(hashIndex + 1) ?? null
  }
  return null
}

function isResetURL (url) {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return false
  }
  if (url.substring(hashIndex + 1) === '_reset') {
    return true
  }
  return false
}

let lastMultiaddr = null

self.onfetch = async (event) => {
  if (isResetURL(event.request.url)) {
    lastMultiaddr = null
  }

  const m = unwrapMultiaddrURI(event.request.url)
  if (m !== null) {
    if (m.indexOf('/webtransport-v1/' !== -1)) {
      lastMultiaddr = m
    }
  }

  if (lastMultiaddr !== null && lastMultiaddr !== undefined) {
    const node = await getLibp2pNode()
    const u = new URL(event.request.url)
    const httpPath = encodeURIComponent(u.pathname)
    const req = cloneRequestWithURL(event.request, `${lastMultiaddr}/http-path/${httpPath}`)

    return event.respondWith(node.services.http.fetch(req))
  }

  return event.respondWith(fetch(event.request))
}

function cloneRequestWithURL (request, newUrl) {
  return new Request(newUrl, {
    body: request.body,
    duplex: request.duplex ?? 'half',
    headers: request.headers,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    method: request.method,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal
  })
}
