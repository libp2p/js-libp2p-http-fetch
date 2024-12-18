/* eslint-env mocha */
import { generateKeyPair, privateKeyFromProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
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
      server = peerIdFromPrivateKey(serverKey)
    }
  })

  it('Should mutually authenticate', async () => {
    const clientAuth = new ClientAuth(clientKey)
    const serverAuth = new ServerAuth(serverKey, h => h === 'example.com')

    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init)
      const resp = await serverAuth.httpHandler(req)
      return resp
    }

    const observedServerPeerId = await clientAuth.authenticateServer('https://example.com/auth', {
      fetch
    })
    expect(observedServerPeerId.equals(server)).to.be.true()
  })

  it('Should mutually authenticate with a custom port', async () => {
    const clientAuth = new ClientAuth(clientKey)
    const serverAuth = new ServerAuth(serverKey, h => h === 'foobar:12345')

    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init)
      const resp = await serverAuth.httpHandler(req)
      return resp
    }

    const observedServerPeerId = await clientAuth.authenticateServer('https://foobar:12345/auth', {
      fetch
    })
    expect(observedServerPeerId.equals(server)).to.be.true()
  })

  it('Should time out when authenticating', async () => {
    const clientAuth = new ClientAuth(clientKey)

    const controller = new AbortController()
    controller.abort()

    await expect(clientAuth.authenticateServer('https://example.com/auth', {
      signal: controller.signal
    })).to.eventually.be.rejected
      .with.property('name', 'AbortError')
  })

  it('Should sent request body to authenticated server', async () => {
    const clientAuth = new ClientAuth(clientKey)
    const serverAuth = new ServerAuth(serverKey, h => h === 'example.com')

    const echoHandler = async (req: Request): Promise<Response> => {
      return new Response(await req.text())
    }
    const httpHandler = serverAuth.withAuth(async (clientId, req) => { return echoHandler(req) })

    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init)
      return httpHandler(req)
    }

    const expectedBody = 'Only for authenticated servers!'
    const response = await clientAuth.authenticatedFetch('https://example.com/auth', { method: 'POST', body: expectedBody, verifyPeer: (observedId) => observedId.equals(server), fetch })

    expect((await response.text())).to.be.equal(expectedBody)
    expect(response.peer.equals(server)).to.be.true()
  })

  it('Should match the test vectors', async () => {
    const clientKeyHex = '080112208139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394'
    const serverKeyHex = '0801124001010101010101010101010101010101010101010101010101010101010101018a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c'
    const clientPubKeyEncoded = uint8ArrayFromString(clientKeyHex, 'base16')
    const serverKey = privateKeyFromProtobuf(uint8ArrayFromString(serverKeyHex, 'base16'))

    const serverSig = await sign(serverKey, PeerIDAuthScheme, [
      ['challenge-server', 'ERERERERERERERERERERERERERERERERERERERERERE='],
      ['client-public-key', clientPubKeyEncoded],
      ['hostname', 'example.com']
    ])
    expect(uint8ArrayToString(serverSig, 'base64urlpad')).to.equal('UA88qZbLUzmAxrD9KECbDCgSKAUBAvBHrOCF2X0uPLR1uUCF7qGfLPc7dw3Olo-LaFCDpk5sXN7TkLWPVvuXAA==')
  })
})
