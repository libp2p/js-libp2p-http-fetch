import { MissingAuthHeaderError, DEFAULT_AUTH_TOKEN_TTL, ClientInitiatedHandshake } from '@libp2p/http-peer-id-auth'
import { getHost, isWebSocketUpgrade } from '@libp2p/http-utils'
import { InvalidMessageError, InvalidParametersError } from '@libp2p/interface'
import { CODE_P2P } from '@multiformats/multiaddr'
import type { Middleware, MiddlewareOptions, HTTP } from '../index.ts'
import type { VerifyPeer } from '@libp2p/http-peer-id-auth'
import type { ComponentLogger, PeerId, PrivateKey } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'

interface AuthToken {
  /**
   * The PeerId of the server
   */
  peerId: PeerId

  /**
   * When the token expires
   */
  expires: number

  /**
   * The authorization header to send
   */
  authorization: string

  /**
   * The handshake
   */
  handshake: ClientInitiatedHandshake
}

interface PeerIdAuthComponents {
  privateKey: PrivateKey
  logger: ComponentLogger
  http: HTTP
}

export const SEC_WEBSOCKET_PROTOCOL_PREFIX = 'authorization='

export interface PeerIdAuthInit {
  verifyPeer?: VerifyPeer
  tokenTTL?: number
}

export class PeerIdAuth implements Middleware {
  private readonly components: PeerIdAuthComponents
  private readonly tokens: Map<string, AuthToken>
  private readonly tokenTTL: number
  private readonly verifyPeer?: VerifyPeer

  constructor (components: PeerIdAuthComponents, init: PeerIdAuthInit) {
    this.components = components
    this.tokens = new Map()
    this.tokenTTL = init.tokenTTL ?? DEFAULT_AUTH_TOKEN_TTL
    this.verifyPeer = init.verifyPeer
  }

  async prepareRequest (resource: URL | Multiaddr[], opts: MiddlewareOptions): Promise<void> {
    const authorization = await this.getOrCreateAuthToken(resource, opts)

    if (isWebSocketInit(opts)) {
      opts.protocols = [
        ...(opts.protocols ?? []),
        `${SEC_WEBSOCKET_PROTOCOL_PREFIX}${btoa(authorization)}`
      ]
    } else {
      if (opts.headers.get('authorization') != null) {
        throw new InvalidParametersError('Will not overwrite existing Authorization header')
      }

      opts.headers.set('Authorization', authorization)
    }
  }

  async getOrCreateAuthToken (resource: URL | Multiaddr[], opts: MiddlewareOptions): Promise<string> {
    const key = getCacheKey(resource, opts.headers)
    let token = this.tokens.get(key)

    // check token expiry
    if (token?.expires != null && token?.expires < Date.now()) {
      this.tokens.delete(key)
      token = undefined
    }

    // create new token
    if (token == null) {
      return this.createAuthToken(resource, opts)
    }

    return token?.authorization
  }

  async createAuthToken (resource: URL | Multiaddr[], opts: MiddlewareOptions): Promise<string> {
    const hostname = getHost(resource, opts.headers)
    const handshake = new ClientInitiatedHandshake(this.components.privateKey, hostname, this.verifyPeer)
    const challenge = handshake.getChallenge()

    // copy existing headers
    const challengeHeaders = new Headers(opts.headers)
    challengeHeaders.set('authorization', challenge)

    // remove any WebSocket upgrade headers
    challengeHeaders.delete('connection')
    challengeHeaders.delete('upgrade')

    // get the server's response
    const resp = await this.components.http.fetch(resource, {
      method: 'OPTIONS',
      headers: challengeHeaders,
      signal: opts.signal,
      middleware: opts.middleware
        .filter(m => m !== this)
        .map(m => () => m)
    })

    // verify the server's challenge
    const response = resp.headers.get('www-authenticate')

    if (response == null) {
      throw new MissingAuthHeaderError('No www-authenticate header in response')
    }

    // verify remote server and answer the server challenge
    const authorization = await handshake.verifyServer(response, opts)

    if (handshake.serverId == null) {
      throw new InvalidMessageError('Failed to get server PeerId')
    }

    const key = getCacheKey(resource, opts.headers)
    this.tokens.set(key, {
      peerId: handshake.serverId,
      authorization,
      expires: Date.now() + this.tokenTTL,
      handshake
    })

    return authorization
  }

  processResponse (resource: URL | Multiaddr[], opts: MiddlewareOptions, response: Response): Response | void {
    const key = getCacheKey(resource, opts.headers)
    const token = this.tokens.get(key)

    // Some parts of fetch responses, such as headers, may be immutable so
    // create a replacement response when we need to change them.
    let output = response

    // add the remote peer id as a response header
    if (token?.peerId != null) {
      const headers = new Headers(response.headers)
      headers.set('x-libp2p-peer-id', token.peerId.toString())

      output = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    // store the bearer token if the server provided it
    const serverAuthHeader = output.headers.get('authentication-info')

    if (serverAuthHeader != null && token != null) {
      token.authorization = token.handshake.decodeBearerToken(serverAuthHeader)
    }

    return output
  }
}

export function peerIdAuth (init: PeerIdAuthInit = {}): (component: any) => Middleware {
  return (components) => {
    return new PeerIdAuth(components, init)
  }
}

function isWebSocketInit (opts?: any): opts is { protocols?: string[] } {
  if (opts == null) {
    return false
  }

  return isWebSocketUpgrade(opts.method, opts.headers)
}

function getCacheKey (resource: URL | Multiaddr[], headers: Headers): string {
  let prefix = ''

  if (Array.isArray(resource)) {
    const peer = resource.map(ma => ma.getComponents().findLast(c => c.code === CODE_P2P)?.value)
      .filter(Boolean)
      .pop()

    if (peer != null) {
      prefix = `${peer}-`
    }
  }

  return `${prefix}${getHost(resource, headers)}`
}
