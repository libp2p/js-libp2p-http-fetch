/* eslint-env mocha */

import { isPeerId, start, stop } from '@libp2p/interface'
import { streamPair } from '@libp2p/interface-compliance-tests/mocks'
import { defaultLogger } from '@libp2p/logger'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { duplexPair } from 'it-pair/duplex'
import { type Libp2p } from 'libp2p'
import pDefer from 'p-defer'
import { stubInterface, type StubbedInstance } from 'sinon-ts'
import { http, type HTTP } from '../src/index.js'
import * as ping from '../src/ping.js'
import type { ComponentLogger, Connection, PeerId, StreamHandler } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'

interface StubbedHTTPComponents {
  registrar: StubbedInstance<Registrar>
  connectionManager: StubbedInstance<ConnectionManager>
  logger: ComponentLogger
}

export function createComponents (): StubbedHTTPComponents {
  return {
    registrar: stubInterface<Registrar>(),
    connectionManager: stubInterface<ConnectionManager>(),
    logger: defaultLogger()
  }
}

describe('whatwg-fetch', () => {
  let serverComponents: StubbedHTTPComponents
  let clientComponents: StubbedHTTPComponents
  let server: HTTP
  let client: HTTP
  const serverPeerID: PeerId = peerIdFromString('12D3KooWJRSrypvnpHgc6ZAgyCni4KcSmbV7uGRaMw5LgMKT18fq')
  const serverMultiaddr: Multiaddr = multiaddr('/ip4/1.2.3.4/tcp/1234' + '/p2p/' + serverPeerID.toString())

  beforeEach(async () => {
    serverComponents = createComponents()
    clientComponents = createComponents()
    await start(serverComponents)
    await start(clientComponents)

    let serverCB: StreamHandler
    const serverCBRegistered = pDefer()
    serverComponents.registrar.handle.callsFake(async (protocol: string, cb: StreamHandler) => {
      serverCB = cb
      serverCBRegistered.resolve()
    })

    const conn = stubInterface<Connection>()
    conn.newStream.callsFake(async (protos: string | string[], options?: any) => {
      const duplexes = duplexPair<any>()
      const streams = streamPair({ duplex: duplexes[0] }, { duplex: duplexes[1] })
      serverCB({ stream: streams[0], connection: conn })
      return streams[1]
    })

    clientComponents.connectionManager.openConnection.callsFake(async (peer: PeerId | Multiaddr | Multiaddr[]) => {
      if (Array.isArray(peer)) {
        peer = peer[0]
      }

      if (isPeerId(peer) ? peer.equals(serverPeerID) : peer.getPeerId() === serverMultiaddr.getPeerId()) {
        await serverCBRegistered.promise
        return conn
      }
      throw new Error('Unexpected peer: ' + peer.toString())
    })

    server = http()(serverComponents)
    client = http()(clientComponents)
    await start(client)
    await start(server)
  })

  afterEach(async () => {
    await stop(serverComponents)
    await stop(clientComponents)
    await stop(server)
    await stop(client)
  })

  it('Standard ping roundtrip', async () => {
    // Mount the ping handler on the server under /ping
    server.handleHTTPProtocol(ping.PING_PROTOCOL_ID, '/ping', ping.servePing)

    const clientNode = stubInterface<Libp2p<{ http: HTTP }>>({ services: { http: client } })

    await ping.sendPing(clientNode, serverMultiaddr)
  })

  it('Standard ping roundtrip with peer id', async () => {
    // Mount the ping handler on the server under /ping
    server.handleHTTPProtocol(ping.PING_PROTOCOL_ID, '/ping', ping.servePing)

    const clientNode = stubInterface<Libp2p<{ http: HTTP }>>({ services: { http: client } })

    await ping.sendPing(clientNode, serverPeerID)
  })

  it('Throws an error if using an http transport with a peer id component', async () => {
    const clientNode = stubInterface<Libp2p<{ http: HTTP }>>({ services: { http: client } })

    await expect(ping.sendPing(clientNode, multiaddr('/ip4/127.0.0.1/http/p2p/' + serverPeerID.toString()))).to.be.rejectedWith('HTTP Transport does not yet support peer IDs')
  })
})
