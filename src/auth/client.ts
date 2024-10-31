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

export interface AuthenticateServerOptions {
  /**
   * The Fetch implementation to use
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch

  /**
   * The hostname to use - by default this will be extracted from the `.host`
   * property of `authEndpointURI`
   */
  hostname?: string
}

export interface VerifyPeerOptions {
  verifyPeer?(peerId: PeerId): Promise<boolean>
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

  public bearerAuthHeader (hostname: string): { 'Authorization': string, peer: PeerId } | undefined {
    const token = this.tokens.get(hostname)
    if (token == null) {
      return undefined
    }
    if (Date.now() - token.creationTime.getTime() > this.tokenTTL) {
      this.tokens.delete(hostname)
      return undefined
    }
    return { Authorization: `${PeerIDAuthScheme} bearer="${token.bearer}"`, peer: token.peer }
  }

  // authenticatedFetch is like `fetch`, but it also handles HTTP Peer ID
  // authentication with the server.
  //
  // If we have not seen the server before, checkID will be called to check if
  // we want to make the request to the server with the given peer id. This
  // happens after we've authenticated the server.
  public async authenticatedFetch (request: string | URL | Request, options?: RequestInit & AuthenticateServerOptions & VerifyPeerOptions): Promise<Response & { peer: PeerId }> {
    const { fetch, hostname, verifyPeer, ...requestOpts } = options ?? {}
    let req: Request
    if (request instanceof Request && Object.keys(requestOpts).length === 0) {
      req = request
    } else {
      req = new Request(request, requestOpts)
    }
    const verifyPeerWithDefault = verifyPeer ?? (async () => true)

    const { response, peer } = await this.doAuthenticatedFetch(req, verifyPeerWithDefault, { fetch, hostname })

    const responseWithPeer: Response & { peer: PeerId } = response as Response & { peer: PeerId }
    responseWithPeer.peer = peer
    return responseWithPeer
  }

  async doAuthenticatedFetch (request: Request, verifyPeer: (server: PeerId) => Promise<boolean>, options?: AuthenticateServerOptions): Promise<{ peer: PeerId, response: Response }> {
    const authEndpointURI = new URL(request.url)
    const hostname = options?.hostname ?? authEndpointURI.host
    const fetch = options?.fetch ?? globalThis.fetch

    if (this.tokens.has(hostname)) {
      const token = this.bearerAuthHeader(hostname)
      if (token !== undefined) {
        request.headers.set('Authorization', token.Authorization)
        return { peer: token.peer, response: await fetch(request) }
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

    const resp = await fetch(authEndpointURI, {
      headers,
      signal: request.signal
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

    const serverPublicKey = publicKeyFromProtobuf(serverPubKeyBytes)
    const serverID = peerIdFromPublicKey(serverPublicKey)

    if (!await verifyPeer(serverID)) {
      throw new Error('Id check failed')
    }

    const sig = await sign(this.key, PeerIDAuthScheme, [
      ['hostname', hostname],
      ['server-public-key', serverPubKeyBytes],
      ['challenge-client', authFields['challenge-client']]])

    const authenticateSelfHeaders = this.encodeAuthParams({
      opaque: authFields.opaque,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })

    request.headers.set('Authorization', authenticateSelfHeaders)
    const resp2 = await fetch(request)

    const serverAuthHeader = resp2.headers.get('Authentication-Info')
    if (serverAuthHeader == null) {
      throw new Error('No server auth header')
    }
    if (resp2.status !== 200) {
      throw new Error('Unexpected status code')
    }

    const serverAuthFields = parseHeader(serverAuthHeader)
    this.tokens.set(hostname, {
      peer: serverID,
      creationTime: new Date(),
      bearer: serverAuthFields.bearer
    })

    return { peer: serverID, response: resp2 }
  }

  public async authenticateServer (authEndpointURI: string | URL, options?: AuthenticateServerOptions & AbortOptions): Promise<PeerId> {
    const req = new Request(authEndpointURI, { signal: options?.signal })
    return (await this.authenticatedFetch(req, options)).peer
  }
}
