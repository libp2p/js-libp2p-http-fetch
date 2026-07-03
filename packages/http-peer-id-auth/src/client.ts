import { publicKeyFromProtobuf, publicKeyToProtobuf } from '@libp2p/crypto/keys'
import { InvalidMessageError } from '@libp2p/interface'
import { peerIdFromPublicKey } from '@libp2p/peer-id'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { InvalidPeerError, InvalidSignatureError, InvalidStateError } from './errors.ts'
import { PEER_ID_AUTH_SCHEME } from './index.ts'
import { decodeAuthorizationHeader, encodeAuthParams, generateChallenge, sign, verify } from './utils.ts'
import type { BearerTokenHeader, ClientChallengeResponseHeader, ClientResponse, ServerChallengeHeader, VerifyClientChallengeResponseOptions, VerifyPeer } from './index.ts'
import type { PeerId, PrivateKey, PublicKey, AbortOptions } from '@libp2p/interface'

export function isClientChallengeResponse (obj?: any): obj is ClientChallengeResponseHeader {
  if (obj == null) {
    return false
  }

  return typeof obj['challenge-client'] === 'string' &&
    typeof obj['public-key'] === 'string' &&
    typeof obj.sig === 'string' &&
    typeof obj.opaque === 'string'
}

export function isServerChallenge (obj?: any): obj is ServerChallengeHeader {
  if (obj == null) {
    return false
  }

  return typeof obj['challenge-client'] === 'string' &&
    typeof obj['public-key'] === 'string' &&
    typeof obj.opaque === 'string'
}

export function isBearerToken (obj: any): obj is BearerTokenHeader {
  if (obj == null) {
    return false
  }

  return typeof obj.bearer === 'string'
}

/**
 * Verify the response to the client challenge created by
 * `createClientChallenge`
 */
export async function verifyClientChallengeResponse (authHeader: ClientChallengeResponseHeader, hostname: string, clientKey: PrivateKey, opts: VerifyClientChallengeResponseOptions = {}): Promise<ClientResponse> {
  const serverPubKeyBytes = uint8ArrayFromString(authHeader['public-key'], 'base64urlpad')
  const serverPublicKey = publicKeyFromProtobuf(serverPubKeyBytes)
  const marshalledClientPubKey = publicKeyToProtobuf(clientKey.publicKey)

  const valid = await verify(serverPublicKey, PEER_ID_AUTH_SCHEME, [
    ['hostname', hostname],
    ['client-public-key', marshalledClientPubKey],
    ['challenge-server', authHeader['challenge-client']]],
  uint8ArrayFromString(authHeader.sig, 'base64urlpad')
  )

  if (!valid) {
    throw new InvalidSignatureError('Invalid signature')
  }

  const serverID = peerIdFromPublicKey(serverPublicKey)

  if ((await opts.verifyPeer?.(serverID, opts)) === false) {
    throw new InvalidPeerError('verifyPeer check failed')
  }

  const sig = await sign(clientKey, PEER_ID_AUTH_SCHEME, [
    ['hostname', hostname],
    ['server-public-key', serverPubKeyBytes],
    ['challenge-client', authHeader['challenge-client']]])

  return {
    peerId: serverID,
    authenticate: encodeAuthParams({
      opaque: authHeader.opaque,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })
  }
}

export async function respondToServerChallenge (serverChallenge: ServerChallengeHeader, hostname: string, clientKey: PrivateKey): Promise<ClientResponse> {
  const serverPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(serverChallenge['public-key'], 'base64urlpad'))
  const serverPeerId = peerIdFromPublicKey(serverPublicKey)

  // sign and return challenge
  const sig = await sign(clientKey, PEER_ID_AUTH_SCHEME, [
    ['hostname', hostname],
    ['server-public-key', publicKeyToProtobuf(serverPublicKey)],
    ['challenge-client', serverChallenge['challenge-client']]
  ])

  return {
    peerId: serverPeerId,
    authenticate: encodeAuthParams({
      'challenge-server': serverChallenge['challenge-client'],
      'public-key': uint8ArrayToString(publicKeyToProtobuf(clientKey.publicKey), 'base64urlpad'),
      sig: uint8ArrayToString(sig, 'base64urlpad'),
      opaque: serverChallenge.opaque
    })
  }
}

export async function decodeBearerToken (authHeader: BearerTokenHeader, clientKey: PrivateKey, challenge: string, hostname: string, serverPublicKey: PublicKey): Promise<string> {
  if (authHeader.sig != null) {
    const marshalledClientPubKey = publicKeyToProtobuf(clientKey.publicKey)
    const valid = await verify(serverPublicKey, PEER_ID_AUTH_SCHEME, [
      ['challenge-server', challenge],
      ['client-public-key', marshalledClientPubKey],
      ['hostname', hostname]],
    uint8ArrayFromString(authHeader.sig, 'base64urlpad')
    )

    if (!valid) {
      throw new InvalidSignatureError('Invalid signature')
    }
  }

  return authHeader.bearer
}

type HandshakeState = 'init' | 'challenge-server' | 'verify-server' | 'respond-to-server' | 'complete'

export class ClientInitiatedHandshake {
  private readonly clientKey: PrivateKey
  private readonly challenge: string
  private readonly hostname: string
  private readonly verifyPeer?: VerifyPeer
  private state: HandshakeState
  public serverId?: PeerId
  public bearer?: string

  constructor (clientKey: PrivateKey, hostname: string, verifyPeer?: VerifyPeer) {
    this.state = 'init'
    this.clientKey = clientKey
    this.challenge = generateChallenge()
    this.hostname = hostname
    this.verifyPeer = verifyPeer
  }

  /**
   * Step 1, send the server a challenge
   */
  getChallenge (): string {
    this.state = 'challenge-server'

    return encodeAuthParams({
      'challenge-server': this.challenge,
      'public-key': uint8ArrayToString(publicKeyToProtobuf(this.clientKey.publicKey), 'base64urlpad')
    })
  }

  /**
   * Step 2, verify the server response, and answer the server challenge
   */
  async verifyServer (header: string, opts?: AbortOptions): Promise<string> {
    if (this.state !== 'challenge-server') {
      throw new InvalidStateError(`Client Initiated Handshake state was "${this.state}" and not "challenge-server"`)
    }

    const message = decodeAuthorizationHeader(header)

    if (!isClientChallengeResponse(message)) {
      throw new InvalidMessageError('Server sent incorrect message')
    }

    this.state = 'verify-server'

    const serverPubKeyBytes = uint8ArrayFromString(message['public-key'], 'base64urlpad')
    const serverPublicKey = publicKeyFromProtobuf(serverPubKeyBytes)
    const marshalledClientPubKey = publicKeyToProtobuf(this.clientKey.publicKey)

    const valid = await verify(serverPublicKey, PEER_ID_AUTH_SCHEME, [
      ['challenge-server', this.challenge],
      ['client-public-key', marshalledClientPubKey],
      ['hostname', this.hostname]
    ], uint8ArrayFromString(message.sig, 'base64urlpad'))

    if (!valid) {
      throw new InvalidSignatureError('Invalid signature')
    }

    this.serverId = peerIdFromPublicKey(serverPublicKey)

    if ((await this.verifyPeer?.(this.serverId, opts)) === false) {
      throw new InvalidPeerError('verifyPeer check failed')
    }

    const sig = await sign(this.clientKey, PEER_ID_AUTH_SCHEME, [
      ['hostname', this.hostname],
      ['server-public-key', serverPubKeyBytes],
      ['challenge-client', message['challenge-client']]])

    this.state = 'respond-to-server'

    return encodeAuthParams({
      opaque: message.opaque,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })
  }

  /**
   * Step 3, decode the bearer token sent by the server
   */
  decodeBearerToken (header: string): string {
    if (this.state !== 'respond-to-server') {
      throw new InvalidStateError(`Client Initiated Handshake state was "${this.state}" and not "respond-to-server"`)
    }

    const message = decodeAuthorizationHeader(header)

    if (!isBearerToken(message)) {
      throw new InvalidMessageError('Server sent incorrect message')
    }

    this.state = 'complete'
    this.bearer = message.bearer

    return encodeAuthParams({
      bearer: this.bearer
    })
  }
}

export class ServerInitiatedHandshake {
  private readonly clientKey: PrivateKey
  private readonly hostname: string
  private readonly verifyPeer?: VerifyPeer
  private state: HandshakeState
  public serverId?: PeerId
  public bearer?: string
  private serverPublicKey?: PublicKey
  private challenge?: string

  constructor (clientKey: PrivateKey, hostname: string, verifyPeer?: VerifyPeer) {
    this.state = 'init'
    this.clientKey = clientKey
    this.hostname = hostname
    this.verifyPeer = verifyPeer
  }

  /**
   * Step 1 respond to the server challenge and issue our own challenge
   */
  async answerServerChallenge (header: string, opts?: AbortOptions): Promise<string> {
    if (this.state !== 'init') {
      throw new InvalidStateError(`Client Initiated Handshake state was "${this.state}" and not "init"`)
    }

    const message = decodeAuthorizationHeader(header)

    if (!isServerChallenge(message)) {
      throw new InvalidMessageError('Server sent incorrect message')
    }

    this.state = 'verify-server'

    this.serverPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(message['public-key'], 'base64urlpad'))
    this.serverId = peerIdFromPublicKey(this.serverPublicKey)
    this.challenge = message['challenge-client']

    // sign and return challenge
    const sig = await sign(this.clientKey, PEER_ID_AUTH_SCHEME, [
      ['hostname', this.hostname],
      ['server-public-key', publicKeyToProtobuf(this.serverPublicKey)],
      ['challenge-client', message['challenge-client']]
    ])

    if ((await this.verifyPeer?.(this.serverId, opts)) === false) {
      throw new InvalidPeerError('verifyPeer check failed')
    }

    this.state = 'challenge-server'

    return encodeAuthParams({
      'challenge-server': message['challenge-client'],
      'public-key': uint8ArrayToString(publicKeyToProtobuf(this.clientKey.publicKey), 'base64urlpad'),
      sig: uint8ArrayToString(sig, 'base64urlpad'),
      opaque: message.opaque
    })
  }

  /**
   * Step 2, verify the server response and extract the bearer token
   */
  async decodeBearerToken (header: string): Promise<string> {
    if (this.state !== 'challenge-server') {
      throw new InvalidStateError(`Client Initiated Handshake state was "${this.state}" and not "challenge-server"`)
    }

    const message = decodeAuthorizationHeader(header)

    if (!isBearerToken(message)) {
      throw new InvalidMessageError('Server sent incorrect message')
    }

    if (message.sig == null) {
      throw new InvalidMessageError('Server sent incorrect message')
    }

    if (this.serverPublicKey == null || this.challenge == null) {
      throw new InvalidStateError('Server public key and/or challenge missing')
    }

    const valid = await verify(this.serverPublicKey, PEER_ID_AUTH_SCHEME, [
      ['hostname', this.hostname],
      ['client-public-key', publicKeyToProtobuf(this.clientKey.publicKey)],
      ['challenge-server', this.challenge]],
    uint8ArrayFromString(message.sig, 'base64urlpad')
    )

    if (!valid) {
      throw new InvalidSignatureError('Invalid signature')
    }

    this.state = 'complete'
    this.bearer = message.bearer

    return encodeAuthParams({
      bearer: this.bearer
    })
  }
}
