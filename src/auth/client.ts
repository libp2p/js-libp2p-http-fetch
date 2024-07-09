import { peerIdFromKeys } from '@libp2p/peer-id'
import { toString as uint8ArrayToString } from 'uint8arrays'
import { BearerAuthScheme, formatHeader, parseAuthFields, parseHeader, PeerIDAuthScheme, sign, verify } from './common.js'
import type { PeerId, PrivateKey } from '@libp2p/interface'

interface Fetch { (input: RequestInfo, init?: RequestInit): Promise<Response> }

export class ClientAuth {
  key: PrivateKey
  tokens = new Map<string, string>() // A map from hostname to token

  constructor (key: PrivateKey) {
    this.key = key
  }

  public async doMutualAuth (fetch: Fetch, hostname: string, authEndpointURI: string): Promise<PeerId> {
  // Make initial request to the auth endpoint
    const resp = await fetch(authEndpointURI)
    const authHeader = resp.headers.get('www-authenticate')
    if (authHeader == null) {
      throw new Error('No auth header')
    }
    const authFields = parseHeader(authHeader).get(PeerIDAuthScheme)
    if (authFields === undefined) {
      throw new Error('No peer id auth scheme')
    }
    if (authFields.scheme !== PeerIDAuthScheme) {
      // Shouldn't happen, but checking to narrow the type of authFields
      throw new Error('Unexpected auth scheme')
    }

    const sig = await sign(this.key, PeerIDAuthScheme, [
      `hostname="${hostname}"`,
      `challenge-client=${authFields.params.get('challenge-client')}`
    ])
    const challengeServer = new Uint8Array(32)
    crypto.getRandomValues(challengeServer)
    const challengeServerStr = uint8ArrayToString(challengeServer, 'base64urlpad')
    const myPeerId = await peerIdFromKeys(this.key.public.bytes)
    let publicKeyStr: string | undefined
    if (myPeerId.publicKey === undefined) {
      publicKeyStr = uint8ArrayToString(this.key.public.marshal())
    }

    const myAuthHeader = formatHeader(PeerIDAuthScheme, {
      hostname: `"${hostname}"`,
      'peer-id': myPeerId.toString(),
      'public-key': publicKeyStr,
      opaque: authFields.params.get('opaque'),
      'challenge-server': challengeServerStr,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })

    const resp2 = await fetch(authEndpointURI, {
      headers: {
        Authorization: myAuthHeader
      }
    })

    // Verify the server's signature
    const serverAuthHeader = resp2.headers.get('Authentication-Info')
    if (serverAuthHeader == null) {
      throw new Error('No server auth header')
    }
    const serverAuthFields = await parseAuthFields(serverAuthHeader, hostname, false)
    if (serverAuthFields.pubKey === undefined || serverAuthFields.id === undefined) {
      throw new Error('Missing public key or peer ID in server Authentication-Info header')
    }
    if (serverAuthFields.signature === undefined) {
      throw new Error('No signature in server auth header')
    }
    const serverSigValid = await verify(serverAuthFields.pubKey, PeerIDAuthScheme, [
      `challenge-server=${challengeServerStr}`,
      `hostname="${hostname}"`,
      `client=${myPeerId}`
    ], serverAuthFields.signature)
    if (!serverSigValid) {
      throw new Error('Server signature invalid')
    }

    // Store token for future use
    const schemes = parseHeader(resp2.headers.get('Authorization') ?? '')
    const bearerScheme = schemes.get(BearerAuthScheme)
    if (bearerScheme === undefined) {
      throw new Error('Missing bearer scheme found')
    }
    if (bearerScheme.scheme !== BearerAuthScheme) {
      throw new Error('Unexpected bearer scheme')
    }
    this.tokens.set(hostname, bearerScheme.bearerToken)

    return serverAuthFields.id
  }

  public bearerAuthHeader (hostname: string): string {
    if (!this.tokens.has(hostname)) {
      throw new Error('No token for hostname')
    }
    return `${BearerAuthScheme} ${this.tokens.get(hostname)}`
  }
}
