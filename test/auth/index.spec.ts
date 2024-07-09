/* eslint-env mocha */
import { generateKeyPair } from '@libp2p/crypto/keys'
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'
import { createFromPrivKey } from '@libp2p/peer-id-factory'
import { expect } from 'aegir/chai'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { ClientAuth } from '../../src/auth/client.js'
import { PeerIDAuthScheme, sign } from '../../src/auth/common.js'
import { ServerAuth } from '../../src/auth/server.js'
import type { PeerId, PrivateKey } from '@libp2p/interface'

describe('HTTP Peer ID Authentication', () => {
  let init = false
  let clientKey: PrivateKey
  let serverKey: PrivateKey
  let server: PeerId
  beforeEach(async () => {
    if (!init) {
      init = true
      clientKey = await generateKeyPair('Ed25519')
      serverKey = await generateKeyPair('Ed25519')
      server = await createFromPrivKey(serverKey)
    }
  })

  it('Should mutually authenticate', async () => {
    const clientAuth = new ClientAuth(clientKey)
    const serverAuth = new ServerAuth(serverKey, ['example.com'])

    const fetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init)
      const resp = await serverAuth.httpHandler(req)
      return resp
    }

    const observedServerPeerId = await clientAuth.doMutualAuth(fetch, 'example.com', 'https://example.com/auth')
    expect(observedServerPeerId.equals(server)).to.be.true()
  })

  it('Should match the test vectors', async () => {
    const zeroKeyHex = '0801124000000000000000000000000000000000000000000000000000000000000000003b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29'
    const clientKeyHex = '080112407e0830617c4a7de83925dfb2694556b12936c477a0e1feb2e148ec9da60fee7d1ed1e8fae2c4a144b8be8fd4b47bf3d3b34b871c3cacf6010f0e42d474fce27e'
    const zeroKey = await unmarshalPrivateKey(uint8ArrayFromString(zeroKeyHex, 'base16'))
    const clientKey = await unmarshalPrivateKey(uint8ArrayFromString(clientKeyHex, 'base16'))
    const clientId = (await createFromPrivKey(clientKey)).toString()

    const clientSig = await sign(clientKey, PeerIDAuthScheme, [
      'challenge-client=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      'hostname="example.com"'
    ])

    expect(uint8ArrayToString(clientSig, 'base64urlpad')).to.equal('F5OBYbbMXoIVJNWrW0UANi7rrbj4GCB6kcEceQjajLTMvC-_jpBF9MFlxiaNYXOEiPQqeo_S56YUSNinwl0ZCQ==')

    const serverSig = await sign(zeroKey, PeerIDAuthScheme, [
      'challenge-server=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
      `client=${clientId}`,
      'hostname="example.com"'
    ])
    expect(uint8ArrayToString(serverSig, 'base64urlpad')).to.equal('btLFqW200aDTQqpkKetJJje7V-iDknXygFqPsfiegNsboXeYDiQ6Rqcpezz1wfr8j9h83QkN9z78cAWzKzV_AQ==')
  })
})
