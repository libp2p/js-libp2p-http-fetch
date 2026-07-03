/**
 * @packageDocumentation
 *
 * This is an implementation of the [Peer ID Auth](https://github.com/libp2p/specs/blob/master/http/peer-id-auth.md)
 * spec that allows clients and servers to exchange PeerIds.
 */

import { publicKeyToProtobuf } from '@libp2p/crypto/keys'
import { InvalidMessageError } from '@libp2p/interface'
import { toString as uint8ArrayToString } from 'uint8arrays'
import { isClientChallenge, isOpaqueData, isServerChallengeResponse, issueBearerToken, respondToClientChallenge, respondToServerChallengeResponse, unwrapBearerToken } from './server.ts'
import { decodeAuthorizationHeader, encodeAuthParams, generateChallenge, genOpaque } from './utils.ts'
import type { AbortOptions, PeerId, PrivateKey } from '@libp2p/interface'

export * from './errors.ts'

export const PEER_ID_AUTH_SCHEME = 'libp2p-PeerID'
export const HTTP_PEER_ID_AUTH_PROTOCOL = '/http-peer-id-auth/1.0.0'
export const DEFAULT_AUTH_TOKEN_TTL = 60 * 60 * 1000 // 1 hour

export interface ClientChallengeHeader {
  'challenge-server': string
  'public-key': string
}

export interface ClientChallengeResponseHeader {
  'challenge-client': string
  'public-key': string
  sig: string
  opaque: string
}

export interface BearerTokenHeader {
  bearer: string
  sig?: string
}

export interface OpaqueDataHeader {
  opaque: string
  sig: string
}

export interface ServerChallengeHeader {
  'challenge-client': string
  'public-key': string
  opaque: string
}

export interface ServerChallengeResponseHeader {
  'challenge-server': string
  'public-key': string
  opaque: string
  sig: string
}

function isBearerToken (obj: any): obj is BearerTokenHeader {
  if (obj == null) {
    return false
  }

  return typeof obj.bearer === 'string'
}

export interface ServerResponse {
  /**
   * The PeerId of the client
   */
  peerId: PeerId

  /**
   * If present this should be sent to the client as a `authentication-info`
   * header
   */
  info?: string

  /**
   * If present this should be sent to the client as a `www-authenticate` header
   */
  authenticate?: string
}

export interface ClientResponse {
  /**
   * The PeerId of the server
   */
  peerId: PeerId

  /**
   * If present this should be sent to the client as a `www-authenticate` header
   */
  authenticate?: string

  /**
   * If present this should be used for subsequent requests
   */
  bearer?: string
}

export interface VerifyPeer {
  (peerId: PeerId, opts?: AbortOptions): boolean | Promise<boolean>
}

export interface VerifyClientChallengeResponseOptions extends AbortOptions {
  verifyPeer?: VerifyPeer
  tokenTTL?: number
}

export async function createServerChallenge (hostname: string, serverKey: PrivateKey): Promise<string> {
  const challenge = generateChallenge()

  return encodeAuthParams({
    'challenge-client': challenge,
    'public-key': uint8ArrayToString(publicKeyToProtobuf(serverKey.publicKey), 'base64urlpad'),
    opaque: await genOpaque(serverKey, {
      challengeClient: challenge,
      hostname,
      creationTime: Date.now()
    })
  })
}

/**
 * Handle incoming messages from the authenticating client
 */
export async function serverResponds (authHeader: string, hostname: string, serverKey: PrivateKey, tokenTTL: number = DEFAULT_AUTH_TOKEN_TTL): Promise<ServerResponse> {
  const authFields = decodeAuthorizationHeader(authHeader)

  if (isServerChallengeResponse(authFields)) {
    return respondToServerChallengeResponse(authFields, hostname, serverKey)
  }

  // client initiates authentication
  if (isClientChallenge(authFields)) {
    return respondToClientChallenge(authFields, hostname, serverKey)
  }

  // client is responding to server challenge
  if (isOpaqueData(authFields)) {
    return issueBearerToken(authFields, hostname, serverKey, tokenTTL)
  }

  // client has previously authenticated
  if (isBearerToken(authFields)) {
    return {
      peerId: await unwrapBearerToken(authFields, hostname, serverKey, tokenTTL)
    }
  }

  throw new InvalidMessageError('Client sent invalid message')
}

export { ClientInitiatedHandshake, ServerInitiatedHandshake } from './client.ts'
