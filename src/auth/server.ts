import { peerIdFromKeys, peerIdFromString } from '@libp2p/peer-id'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { BearerAuthScheme, formatHeader, parseAuthFields, parseHeader, PeerIDAuthScheme, sign, verify } from './common.js'
import type { PeerId, PrivateKey, PublicKey } from '@libp2p/interface'

export class ServerAuth {
  key: PrivateKey
  validHostnames = new Set<string>()
  tokenExpiration = 60 * 60 * 1000 // 1 hour

  constructor (key: PrivateKey, validHostnames: string[]) {
    this.key = key
    for (const hostname of validHostnames) {
      this.validHostnames.add(hostname)
    }
  }

  private readHostname (req: Request): string {
    const url = new URL(req.url)
    let hostname = url.hostname
    if (url.protocol === 'http:' && url.port !== '80') {
      hostname += ':' + url.port
    }
    if (url.protocol === 'https:' && url.port !== '443') {
      hostname += ':' + url.port
    }
    if (hostname === '') {
      throw new Error('No hostname')
    }
    return hostname
  }

  async httpHandler (req: Request): Promise<Response> {
    const hostname = this.readHostname(req)
    if (!this.validHostnames.has(hostname)) {
      return new Response('', { status: 400 })
    }

    if (req.headers === undefined) {
      return this.returnChallenge(hostname)
    }
    const authHeader = req.headers.get('Authorization')
    if (authHeader === null || authHeader === undefined || authHeader === '') {
      return this.returnChallenge(hostname)
    }

    const schemes = parseHeader(authHeader)
    const bearerScheme = schemes.get(BearerAuthScheme)
    if (bearerScheme !== undefined && bearerScheme.scheme === BearerAuthScheme) {
      await this.unwrapBearerToken(hostname, bearerScheme.bearerToken)
      return new Response('', { status: 200 })
    }

    const authFields = await parseAuthFields(authHeader, hostname, true)
    if (authFields.opaque === undefined) {
      return this.returnChallenge(hostname)
    }
    if (authFields.signature === undefined) {
      return new Response('Missing signature', { status: 400 })
    }
    if (authFields.pubKey === undefined || authFields.id === undefined) {
      return new Response('Missing peerid/public-key', { status: 400 })
    }

    let unwrapped: OpaqueUnwrapped
    try {
      unwrapped = await this.unwrapOpaque(authFields.opaque)
    } catch (err) {
      // Invalid opaque
      return new Response('', { status: 400 })
    }

    if (unwrapped.hostname !== hostname) {
      return new Response('', { status: 400 })
    }

    if (Date.now() - unwrapped.creationTime > this.tokenExpiration) {
      // Token expired
      return this.returnChallenge(hostname)
    }

    const valid = await verify(authFields.pubKey, PeerIDAuthScheme, [
        `hostname="${hostname}"`,
        `challenge-client=${unwrapped.clientChallenge}`
    ], authFields.signature)
    if (!valid) {
      return new Response('', { status: 400 })
    }

    // Client has authenticated, now we authenticate ourselves
    const sig = await sign(this.key, PeerIDAuthScheme, [
        `hostname="${hostname}"`,
        `client=${authFields.id.toString()}`,
        `challenge-server=${authFields.challengeServerB64}`
    ])
    const myPeerId = await peerIdFromKeys(this.key.public.bytes)
    let publicKeyStr: string | undefined
    if (myPeerId.publicKey === undefined) {
      publicKeyStr = uint8ArrayToString(this.key.public.marshal())
    }
    const myAuthHeader = formatHeader(PeerIDAuthScheme, {
      hostname: `"${hostname}"`,
      'peer-id': myPeerId.toString(),
      'public-key': publicKeyStr,
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })

    // Generate a bearer token for the client to use on future requests
    const tok = this.genBearerToken(authFields.id, hostname)

    return new Response('', {
      headers: {
        'Authentication-Info': myAuthHeader,
        Authorization: `${BearerAuthScheme} ${tok}`
      }
    })
  }

  async returnChallenge (hostname: string): Promise<Response> {
    const challengeClient = new Uint8Array(32)
    crypto.getRandomValues(challengeClient)
    const challengeClientStr = uint8ArrayToString(challengeClient, 'base64urlpad')

    const opaque = this.genOpaque(challengeClientStr, hostname)
    return new Response('', {
      status: 401,
      headers: {
        'WWW-Authenticate': formatHeader(PeerIDAuthScheme, { 'challenge-client': challengeClientStr, opaque })
      }
    })
  }

  genBearerToken (clientPeerId: PeerId, hostname: string): string {
    return this.signBox(this.key, {
      peer: clientPeerId.toString(),
      h: hostname,
      t: Date.now()
    })
  }

  public async unwrapBearerToken (expectedHostname: string, token: string): Promise<PeerId> {
    if (token.startsWith(BearerAuthScheme)) {
      // Parse the whole header for convenience (avoids having to have the caller do this)
      const s = parseHeader(token).get(BearerAuthScheme)
      if (s === undefined || s.scheme !== BearerAuthScheme) {
        throw new Error('Invalid bearer token')
      }
      token = s.bearerToken
    }
    const unwrapped = await this.verifyBox(this.key.public, token) as any
    if (typeof unwrapped.peer !== 'string' || typeof unwrapped.h !== 'string' || typeof unwrapped.t !== 'number') {
      throw new Error('Invalid bearer token')
    }
    if (unwrapped.h !== expectedHostname) {
      throw new Error('Invalid hostname')
    }
    if (Date.now() - unwrapped.t > this.tokenExpiration) {
      throw new Error('Token expired')
    }
    return peerIdFromString(unwrapped.peer)
  }

  genOpaque (clientChallengeB64: string, hostname: string): string {
    const unwrapped: OpaqueUnwrapped = {
      clientChallenge: clientChallengeB64,
      hostname,
      creationTime: Date.now()
    }
    return this.signBox(this.key, unwrapped)
  }

  async unwrapOpaque (opaque: string): Promise<OpaqueUnwrapped> {
    const unwrapped = await this.verifyBox(this.key.public, opaque) as any
    if (typeof unwrapped.clientChallenge !== 'string' || typeof unwrapped.hostname !== 'string' || typeof unwrapped.creationTime !== 'number') {
      throw new Error('Invalid opaque')
    }
    return unwrapped
  }

  signBox (key: PrivateKey, data: unknown): string {
    const dataSerialized = JSON.stringify(data)
    const dataBytes = textEncoder.encode(dataSerialized)
    const sig = key.sign(dataBytes)
    const jsonStr = JSON.stringify({
      val: uint8ArrayToString(dataBytes, 'base64urlpad'),
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })
    return uint8ArrayToString(textEncoder.encode(jsonStr), 'base64urlpad')
  }

  async verifyBox (key: PublicKey, data: string): Promise<unknown> {
    const { sig, val } = JSON.parse(textDecoder.decode(uint8ArrayFromString(data, 'base64urlpad')))
    const valBytes = uint8ArrayFromString(val, 'base64urlpad')
    const sigValid = await key.verify(valBytes, uint8ArrayFromString(sig, 'base64urlpad'))
    if (!sigValid) {
      throw new Error('Invalid signature')
    }
    const valStr = textDecoder.decode(valBytes)
    return JSON.parse(valStr)
  }
}

interface OpaqueUnwrapped {
  clientChallenge: string
  hostname: string
  creationTime: number
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
