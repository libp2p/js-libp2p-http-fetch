import { generateKeyPair, privateKeyFromProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { expect } from 'aegir/chai'
import { fromString as uint8ArrayFromString } from 'uint8arrays'
import { ClientInitiatedHandshake, ServerInitiatedHandshake } from '../src/client.ts'
import { PEER_ID_AUTH_SCHEME, createServerChallenge, serverResponds } from '../src/index.ts'
import { sign, verify } from '../src/utils.ts'
import type { PeerId, PrivateKey } from '@libp2p/interface'

describe('@libp2p/http-peer-id-auth', () => {
  let init = false
  let clientPrivateKey: PrivateKey
  let serverPrivateKey: PrivateKey
  let serverPeerId: PeerId
  let clientPeerId: PeerId
  const hostname = 'example.com'

  beforeEach(async () => {
    if (!init) {
      init = true
      clientPrivateKey = await generateKeyPair('Ed25519')
      clientPeerId = peerIdFromPrivateKey(clientPrivateKey)
      serverPrivateKey = await generateKeyPair('Ed25519')
      serverPeerId = peerIdFromPrivateKey(serverPrivateKey)
    }
  })

  it('should allow client to initiate authentication', async () => {
    const client = new ClientInitiatedHandshake(clientPrivateKey, hostname)

    const clientChallenge = client.getChallenge()

    // server responds to client challenge, issues server challenge
    const serverResponse = await serverResponds(clientChallenge, hostname, serverPrivateKey)
    expect(serverResponse.peerId).to.deep.equal(clientPeerId)

    if (serverResponse.authenticate == null) {
      throw new Error('Server did not challenge client')
    }

    // client verifies server response and responds to server challenge
    const clientAnswer = await client.verifyServer(serverResponse.authenticate)

    // client responds to the server challenge
    const serverResponse2 = await serverResponds(clientAnswer, hostname, serverPrivateKey)
    expect(serverResponse2.peerId).to.deep.equal(clientPeerId)

    if (serverResponse2.info == null) {
      throw new Error('Server did not issue bearer token')
    }

    // read bearer token from response
    const bearer = client.decodeBearerToken(serverResponse2.info)

    // use the bearer token for a subsequent request
    const serverResponse3 = await serverResponds(bearer, hostname, serverPrivateKey)
    expect(serverResponse3.peerId).to.deep.equal(clientPeerId)

    expect(client.serverId).to.deep.equal(serverPeerId)
  })

  it('should allow server to initiate authentication', async () => {
    const client = new ServerInitiatedHandshake(clientPrivateKey, hostname)

    const serverChallenge = await createServerChallenge(hostname, serverPrivateKey)

    // client responds to server challenge, issues client challenge
    const clientResponse = await client.answerServerChallenge(serverChallenge)
    expect(client.serverId).to.deep.equal(serverPeerId)

    // server responds to client challenge, issues bearer token with signature
    const serverResponse = await serverResponds(clientResponse, hostname, serverPrivateKey)
    expect(serverResponse.peerId).to.deep.equal(clientPeerId)

    if (serverResponse.info == null) {
      throw new Error('Server did not issue bearer token')
    }

    const bearer = await client.decodeBearerToken(serverResponse.info)

    // use the bearer token for a subsequent request
    const serverResponse2 = await serverResponds(bearer, hostname, serverPrivateKey)
    expect(serverResponse2.peerId).to.deep.equal(clientPeerId)
  })

  it('should match the test vectors', async () => {
    const clientKeyHex = '080112208139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394'
    const serverKeyHex = '0801124001010101010101010101010101010101010101010101010101010101010101018a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c'
    const clientPubKeyEncoded = uint8ArrayFromString(clientKeyHex, 'base16')
    const serverKey = privateKeyFromProtobuf(uint8ArrayFromString(serverKeyHex, 'base16'))

    const serverSig = await sign(serverKey, PEER_ID_AUTH_SCHEME, [
      // cspell:disable-next-line
      ['challenge-server', 'ERERERERERERERERERERERERERERERERERERERERERE='],
      ['client-public-key', clientPubKeyEncoded],
      ['hostname', 'example.com']
    ])

    await expect(verify(serverKey.publicKey, PEER_ID_AUTH_SCHEME, [
      // cspell:disable-next-line
      ['challenge-server', 'ERERERERERERERERERERERERERERERERERERERERERE='],
      ['client-public-key', clientPubKeyEncoded],
      ['hostname', 'example.com']
    ], serverSig)).to.eventually.be.true()

    await expect(verify(serverKey.publicKey, PEER_ID_AUTH_SCHEME, [
      // cspell:disable-next-line
      ['challenge-server', 'ERERERERERERERERERERERERERERERERERERERERERE='],
      ['client-public-key', clientPubKeyEncoded],
      ['hostname', 'example.com']
    ], uint8ArrayFromString('UA88qZbLUzmAxrD9KECbDCgSKAUBAvBHrOCF2X0uPLR1uUCF7qGfLPc7dw3Olo-LaFCDpk5sXN7TkLWPVvuXAA==', 'base64urlpad'))).to.eventually.be.true()

    // TODO: safari generates non-deterministic different signatures?
    await expect(verify(serverKey.publicKey, PEER_ID_AUTH_SCHEME, [
      // cspell:disable-next-line
      ['challenge-server', 'ERERERERERERERERERERERERERERERERERERERERERE='],
      ['client-public-key', clientPubKeyEncoded],
      ['hostname', 'example.com']
    ], uint8ArrayFromString('hq3aR3scVMt8VrRopWYJHHJsEerdqnt-f_JvNQJ6R09yRy57Ut9_7G30TRHUqBtJb_Eh5kq3P5VvPWVQW43fBA==', 'base64urlpad'))).to.eventually.be.true()
  })
})
