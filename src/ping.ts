// http-ping implementation
import { isPeerId, type Libp2p, type PeerId } from '@libp2p/interface'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import type { HTTP } from './index.js'

const PING_SIZE = 32
export const PING_PROTOCOL_ID = '/http-ping/1'

/**
 * Serve a ping request
 *
 * @param req - An HTTP Request object
 * @returns a Response object
 */
export async function servePing (req: Request): Promise<Response> {
  const buf = new Uint8Array(await req.arrayBuffer())
  if (buf.length !== PING_SIZE) {
    return new Response(null, { status: 400 })
  }
  return new Response(
    buf,
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': `${PING_SIZE}`
      }
    }
  )
}

/**
 * Send a ping request to a peer
 *
 * @param node - a libp2p node
 * @param peerIdOrMultiaddr - Target peer
 */
export async function sendPing (node: Libp2p<{ http: HTTP }>, peerIdOrMultiaddr: PeerId | Multiaddr): Promise<void> {
  const peerAddr: Multiaddr = isPeerId(peerIdOrMultiaddr) ? multiaddr(`/p2p/${peerIdOrMultiaddr.toString()}`) : peerIdOrMultiaddr
  const buf = new Uint8Array(PING_SIZE)
  // Fill buffer with random data
  crypto.getRandomValues(buf)
  const pingEndpoint = await node.services.http.prefixForProtocol(peerAddr, PING_PROTOCOL_ID)
  const requestURL = 'multiaddr:' + peerAddr.encapsulate(`/http-path/${encodeURIComponent(pingEndpoint)}`).toString()

  const resp = await node.services.http.fetch(new Request(requestURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': `${PING_SIZE}`
    },
    body: buf
  }))
  if (resp.status !== 200) {
    throw new Error(`Unexpected status code: ${resp.status}`)
  }

  const respBuf = new Uint8Array(await resp.arrayBuffer())
  if (respBuf.length !== PING_SIZE) {
    throw new Error(`Unexpected response size: ${respBuf.length}`)
  }
  if (!buf.every((v, i) => v === respBuf[i])) {
    throw new Error('Ping body mismatch')
  }
}
