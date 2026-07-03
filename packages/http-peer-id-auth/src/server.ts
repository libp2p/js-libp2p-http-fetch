import { publicKeyFromProtobuf, publicKeyToProtobuf } from '@libp2p/crypto/keys'
import { InvalidMessageError } from '@libp2p/interface'
import { peerIdFromPublicKey, peerIdFromString } from '@libp2p/peer-id'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { DEFAULT_AUTH_TOKEN_TTL, PEER_ID_AUTH_SCHEME } from './index.ts'
import { encodeAuthParams, genBearerToken, genOpaque, generateChallenge, sign, unwrapOpaque, verify, verifyBox } from './utils.ts'
import { validateOpaqueData } from './validation.ts'
import type { BearerTokenHeader, ClientChallengeHeader, OpaqueDataHeader, ServerChallengeResponseHeader, ServerResponse } from './index.ts'
import type { PeerId, PrivateKey } from '@libp2p/interface'

export function isClientChallenge (obj: any): obj is ClientChallengeHeader {
  if (obj == null) {
    return false
  }

  return typeof obj['challenge-server'] === 'string' && typeof obj['public-key'] === 'string'
}

export function isOpaqueData (obj: any): obj is OpaqueDataHeader {
  if (obj == null) {
    return false
  }

  return typeof obj.opaque === 'string' && typeof obj.sig === 'string'
}

export function isServerChallengeResponse (obj?: any): obj is ServerChallengeResponseHeader {
  if (obj == null) {
    return false
  }

  return typeof obj['challenge-server'] === 'string' &&
    typeof obj['public-key'] === 'string' &&
    typeof obj.opaque === 'string' &&
    typeof obj.sig === 'string'
}

export async function issueBearerToken (data: OpaqueDataHeader, hostname: string, serverKey: PrivateKey, tokenTTL: number): Promise<ServerResponse> {
  const opaque = await unwrapOpaque(serverKey.publicKey, data)
  validateOpaqueData(opaque, hostname, tokenTTL)

  if (opaque.clientPublicKey == null) {
    throw new InvalidMessageError('Missing client public key')
  }

  const clientPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(opaque.clientPublicKey, 'base64urlpad'))
  const clientPeerId = peerIdFromPublicKey(clientPublicKey)

  const valid = await verify(clientPublicKey, PEER_ID_AUTH_SCHEME, [
    ['challenge-client', opaque.challengeClient],
    ['hostname', hostname],
    ['server-public-key', publicKeyToProtobuf(serverKey.publicKey)]
  ], uint8ArrayFromString(data.sig, 'base64urlpad'))

  if (!valid) {
    throw new InvalidMessageError('Invalid signature')
  }

  // return a bearer token
  return {
    peerId: clientPeerId,
    info: encodeAuthParams({
      bearer: await genBearerToken(serverKey, clientPeerId, hostname)
    })
  }
}

export async function respondToClientChallenge (clientChallenge: ClientChallengeHeader, hostname: string, serverKey: PrivateKey): Promise<ServerResponse> {
  const clientPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(clientChallenge['public-key'], 'base64urlpad'))
  const clientPeerId = peerIdFromPublicKey(clientPublicKey)

  // sign and return challenge
  const sig = await sign(serverKey, PEER_ID_AUTH_SCHEME, [
    ['challenge-server', clientChallenge['challenge-server']],
    ['client-public-key', publicKeyToProtobuf(clientPublicKey)],
    ['hostname', hostname]
  ])

  const challenge = generateChallenge()

  return {
    peerId: clientPeerId,
    authenticate: encodeAuthParams({
      'challenge-client': challenge,
      'public-key': uint8ArrayToString(publicKeyToProtobuf(serverKey.publicKey), 'base64urlpad'),
      sig: uint8ArrayToString(sig, 'base64urlpad'),
      opaque: await genOpaque(serverKey, {
        challengeClient: challenge,
        creationTime: Date.now(),
        hostname,
        clientPublicKey: clientChallenge['public-key']
      })
    })
  }
}

export async function respondToServerChallengeResponse (response: ServerChallengeResponseHeader, hostname: string, serverKey: PrivateKey): Promise<ServerResponse> {
  const clientPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(response['public-key'], 'base64urlpad'))
  const clientPeerId = peerIdFromPublicKey(clientPublicKey)

  // sign and return challenge
  const sig = await sign(serverKey, PEER_ID_AUTH_SCHEME, [
    ['challenge-server', response['challenge-server']],
    ['client-public-key', publicKeyToProtobuf(clientPublicKey)],
    ['hostname', hostname]
  ])

  return {
    peerId: clientPeerId,
    info: encodeAuthParams({
      sig: uint8ArrayToString(sig, 'base64urlpad'),
      bearer: await genBearerToken(serverKey, clientPeerId, hostname)
    })
  }
}

export async function unwrapBearerToken (token: BearerTokenHeader, expectedHostname: string, privateKey: PrivateKey, tokenTTL: number): Promise<PeerId> {
  const unwrapped = await verifyBox(privateKey.publicKey, token.bearer) as any

  if (typeof unwrapped.peer !== 'string' || typeof unwrapped.h !== 'string' || typeof unwrapped.t !== 'number') {
    throw new InvalidMessageError('Invalid bearer token')
  }

  if (unwrapped.h !== expectedHostname) {
    throw new InvalidMessageError('Invalid hostname')
  }

  if (Date.now() - unwrapped.t > (tokenTTL ?? DEFAULT_AUTH_TOKEN_TTL)) {
    throw new InvalidMessageError('Token expired')
  }

  return peerIdFromString(unwrapped.peer)
}
