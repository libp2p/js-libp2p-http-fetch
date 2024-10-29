import { publicKeyFromProtobuf, publicKeyToProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPublicKey } from '@libp2p/peer-id'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { parseHeader, PeerIDAuthScheme, sign, verify } from './common.js'
import type { PeerId, PrivateKey } from '@libp2p/interface'
import type { AbortOptions } from '@multiformats/multiaddr'

interface tokenInfo {
  creationTime: Date
  bearer: string
  peer: PeerId
}

export interface AuthenticateServerOptions extends AbortOptions {
  /**
   * The Fetch implementation to use
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch

  /**
   * The hostname to use - by default this will be extracted from the
   * `authEndpointURI`
   */
  hostname?: string
}

export class ClientAuth {
  key: PrivateKey
  tokens = new Map<string, tokenInfo>() // A map from hostname to token
  tokenTTL = 60 * 60 * 1000 // 1 hour

  constructor (key: PrivateKey, opts?: { tokenTTL?: number }) {
    this.key = key
    if (opts?.tokenTTL !== undefined) {
      this.tokenTTL = opts.tokenTTL
    }
  }

  private generateChallenge (): string {
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    return uint8ArrayToString(randomBytes, 'base64urlpad')
  }

  private encodeAuthParams (params: Record<string, string>): string {
    const encodedParams = Object.entries(params)
      .map(([key, value]) => `${key}="${value}"`)
      .join(', ')
    return `${PeerIDAuthScheme} ${encodedParams}`
  }

  public bearerAuthHeader (hostname: string): string | undefined {
    const token = this.tokens.get(hostname)
    if (token == null) {
      return undefined
    }
    if (Date.now() - token.creationTime.getTime() > this.tokenTTL) {
      this.tokens.delete(hostname)
      return undefined
    }
    return `${PeerIDAuthScheme} bearer="${token.bearer}"`
  }

  public async authenticateServer (authEndpointURI: string | URL, options?: AuthenticateServerOptions): Promise<PeerId> {
    authEndpointURI = new URL(authEndpointURI)
    const hostname = options?.hostname ?? authEndpointURI.hostname

    if (this.tokens.has(hostname)) {
      const token = this.tokens.get(hostname)
      if (token !== undefined && Date.now() - token.creationTime.getTime() < this.tokenTTL) {
        return token.peer
      } else {
        this.tokens.delete(hostname)
      }
    }

    // Client initiated handshake (server initiated is not implemented yet)
    const marshaledClientPubKey = publicKeyToProtobuf(this.key.publicKey)
    const publicKeyStr = uint8ArrayToString(marshaledClientPubKey, 'base64urlpad')
    const challengeServer = this.generateChallenge()
    const headers = {
      Authorization: this.encodeAuthParams({
        'challenge-server': challengeServer,
        'public-key': publicKeyStr
      })
    }

    const fetch = options?.fetch ?? globalThis.fetch
    const resp = await fetch(authEndpointURI, {
      headers,
      signal: options?.signal
    })

    // Verify the server's challenge
    const authHeader = resp.headers.get('www-authenticate')
    if (authHeader == null) {
      throw new Error('No auth header')
    }
    const authFields = parseHeader(authHeader)
    const serverPubKeyBytes = uint8ArrayFromString(authFields['public-key'], 'base64urlpad')
    const serverPubKey = publicKeyFromProtobuf(serverPubKeyBytes)

    const valid = await verify(serverPubKey, PeerIDAuthScheme, [
      ['hostname', hostname],
      ['client-public-key', marshaledClientPubKey],
      ['challenge-server', challengeServer]], uint8ArrayFromString(authFields.sig, 'base64urlpad'))
    if (!valid) {
      throw new Error('Invalid signature')
    }

    const sig = await sign(this.key, PeerIDAuthScheme, [
      ['hostname', hostname],
      ['server-public-key', serverPubKeyBytes],
      ['challenge-client', authFields['challenge-client']]])

    const authenticateSelfHeaders = this.encodeAuthParams({
      opaque: authFields.opaque,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })

    const resp2 = await fetch(authEndpointURI, {
      headers: {
        Authorization: authenticateSelfHeaders
      },
      signal: options?.signal
    })

    // Verify the server's signature
    const serverAuthHeader = resp2.headers.get('Authentication-Info')
    if (serverAuthHeader == null) {
      throw new Error('No server auth header')
    }
    if (resp2.status !== 200) {
      throw new Error('Unexpected status code')
    }

    const serverAuthFields = parseHeader(serverAuthHeader)
    const serverPublicKey = publicKeyFromProtobuf(serverPubKeyBytes)
    const serverID = peerIdFromPublicKey(serverPublicKey)
    this.tokens.set(hostname, {
      peer: serverID,
      creationTime: new Date(),
      bearer: serverAuthFields.bearer
    })

    return serverID
  }
}
