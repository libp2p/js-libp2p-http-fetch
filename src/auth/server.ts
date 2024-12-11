import { publicKeyFromProtobuf, publicKeyToProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPublicKey, peerIdFromString } from '@libp2p/peer-id'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { encodeAuthParams, parseHeader, PeerIDAuthScheme, sign, verify } from './common.js'
import type { PeerId, PrivateKey, PublicKey, Logger } from '@libp2p/interface'
import type http from 'node:http'

export interface HttpHandler { (req: Request): Promise<Response> }

export interface ServerAuthOps {
  logger?: Logger
  tokenTTL?: number
}

export class ServerAuth {
  private readonly key: PrivateKey
  private readonly validHostname: (hostname: string) => boolean
  private readonly tokenTTL = 60 * 60 * 1000 // 1 hour
  private readonly logger?: Logger

  constructor (key: PrivateKey, validHostnames: (hostname: string) => boolean, opts?: ServerAuthOps) {
    this.key = key
    this.validHostname = validHostnames
    this.logger = opts?.logger
    if (opts?.tokenTTL !== undefined) {
      this.tokenTTL = opts.tokenTTL
    }
  }

  httpHandler = this.withAuth.bind(this)(async (_peer, _req) => {
    return new Response('', { status: 200 })
  })

  withAuth (httpAuthedHandler: (peer: PeerId, req: Request) => Promise<Response>): HttpHandler {
    return async (req: Request): Promise<Response> => {
      const authResp = await this.authenticateRequest(this.readHostname(req), req.headers.get('Authorization') ?? undefined)
      if (authResp.status !== 200 || authResp.peer === undefined) {
        return new Response('', { status: authResp.status, headers: authResp.headers })
      }

      const innerHandlerResp = await httpAuthedHandler(authResp.peer, req)

      const mergedHeaders: Record<string, string> = {}
      // Merge using for of to only bring in actual fields from the headers (no
      // inner symbols)
      for (const [key, value] of innerHandlerResp.headers) {
        mergedHeaders[key] = value
      }
      if (authResp.headers !== undefined) {
        for (const [key, value] of Object.entries(authResp.headers)) {
          mergedHeaders[key] = value
        }
      }

      return new Response(innerHandlerResp.body, { status: innerHandlerResp.status, headers: mergedHeaders })
    }
  }

  requestListener (httpAuthedHandler: (peer: PeerId, req: http.IncomingMessage, res: http.ServerResponse) => void): http.RequestListener {
    return (req: http.IncomingMessage, res: http.ServerResponse): void => {
      Promise.resolve()
        .then(async () => {
          const authResp = await this.authenticateRequest(req.headers.host ?? '', req.headers.authorization)

          for (const [key, value] of Object.entries(authResp.headers ?? {})) {
            res.setHeader(key, value)
          }

          if (authResp.status !== 200 || authResp.peer === undefined) {
            res.statusCode = authResp.status
            res.end()

            return
          }

          httpAuthedHandler(authResp.peer, req, res)
        })
        .catch(err => {
          this.logger?.error('error handling request - %e', err)
        })
    }
  }

  /* eslint-disable-next-line complexity */
  private async authenticateRequest (hostname: string, authHeader?: string): Promise<AuthenticationResponse> {
    if (!this.validHostname(hostname)) {
      return { status: 400 }
    }

    if (authHeader === null || authHeader === undefined || authHeader === '') {
      return this.returnChallenge(hostname, null, {})
    }

    const authFields = parseHeader(authHeader)
    if (authFields.bearer !== undefined && authFields.bearer !== '') {
      const peer = await this.unwrapBearerToken(hostname, authFields.bearer)
      return { status: 200, peer }
    }

    let opaqueState: OpaqueUnwrapped | null = null
    if (authFields.opaque !== undefined) {
      try {
        const opaque = await this.unwrapOpaque(authFields.opaque)
        if (opaque.hostname !== hostname) {
          this.logger?.error('Invalid hostname')
          return { status: 400 }
        }
        if (Date.now() - opaque.creationTime > this.tokenTTL) {
          this.logger?.error('Token expired')
          return { status: 400 }
        }

        opaqueState = opaque
      } catch (e) {
        this.logger?.error('Invalid opaque')
        return { status: 400 }
      }
    }

    let clientPublicKey: PublicKey | null = null
    if (opaqueState?.clientPublicKey !== undefined) {
      clientPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(opaqueState.clientPublicKey, 'base64urlpad'))
    } else if (authFields['public-key'] !== undefined) {
      clientPublicKey = publicKeyFromProtobuf(uint8ArrayFromString(authFields['public-key'], 'base64urlpad'))
    }

    const returnParams: Record<string, string> = {}
    let clientPeerId: PeerId | undefined
    if (authFields.sig !== undefined) {
      // Verify signature
      if (clientPublicKey === null) {
        this.logger?.error('Missing public-key')
        return { status: 400 }
      }
      if (opaqueState?.challengeClient === null) {
        this.logger?.error('Missing challenge-client')
        return { status: 400 }
      }

      const valid = await verify(clientPublicKey, PeerIDAuthScheme, [
        ['challenge-client', opaqueState?.challengeClient ?? ''],
        ['hostname', hostname],
        ['server-public-key', publicKeyToProtobuf(this.key.publicKey)]
      ], uint8ArrayFromString(authFields.sig, 'base64urlpad'))
      if (!valid) {
        this.logger?.error('Invalid signature')
        return { status: 400 }
      }

      // Return a bearer token
      clientPeerId = peerIdFromPublicKey(clientPublicKey)
      returnParams.bearer = this.genBearerToken(clientPeerId, hostname)
    }

    if (authFields['challenge-server'] !== undefined) {
      if (clientPublicKey === null) {
        this.logger?.error('Missing public-key')
        return { status: 400 }
      }

      // Sign and return challenge
      const sig = await sign(this.key, PeerIDAuthScheme, [
        ['hostname', hostname],
        ['client-public-key', publicKeyToProtobuf(clientPublicKey)],
        ['challenge-server', authFields['challenge-server']]
      ])
      returnParams['public-key'] = uint8ArrayToString(publicKeyToProtobuf(this.key.publicKey), 'base64urlpad')
      returnParams.sig = uint8ArrayToString(sig, 'base64urlpad')
    }

    if (returnParams.bearer !== undefined) {
      return { status: 200, peer: clientPeerId, headers: { 'Authentication-info': encodeAuthParams(returnParams) } }
    } else {
      // Not authenticated
      return this.returnChallenge(hostname, clientPublicKey, returnParams)
    }
  }

  private readHostname (req: Request): string {
    const url = new URL(req.url)
    let hostname = url.hostname
    if (url.port === '' || url.port === undefined) {
      return hostname
    }
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

  private async returnChallenge (hostname: string, clientPublicKey: PublicKey | null, returnParams: Record<string, string>): Promise<AuthenticationResponse> {
    const challenge = this.generateChallenge()
    returnParams['challenge-client'] = challenge

    returnParams.opaque = this.genOpaque({
      challengeClient: challenge,
      clientPublicKey: clientPublicKey !== null ? uint8ArrayToString(publicKeyToProtobuf(clientPublicKey), 'base64urlpad') : undefined,
      hostname,
      creationTime: Date.now()
    })
    return { status: 401, headers: { 'WWW-Authenticate': encodeAuthParams(returnParams) } }
  }

  private genBearerToken (clientPeerId: PeerId, hostname: string): string {
    return this.signBox(this.key, {
      peer: clientPeerId.toString(),
      h: hostname,
      t: Date.now()
    })
  }

  private async unwrapBearerToken (expectedHostname: string, token: string): Promise<PeerId> {
    if (token.length < PeerIDAuthScheme.length + 1) {
      throw new Error('Invalid bearer token')
    }
    const bearer = parseHeader(token).bearer
    const unwrapped = await this.verifyBox(this.key.publicKey, bearer) as any
    if (typeof unwrapped.peer !== 'string' || typeof unwrapped.h !== 'string' || typeof unwrapped.t !== 'number') {
      throw new Error('Invalid bearer token')
    }
    if (unwrapped.h !== expectedHostname) {
      throw new Error('Invalid hostname')
    }
    if (Date.now() - unwrapped.t > this.tokenTTL) {
      throw new Error('Token expired')
    }
    return peerIdFromString(unwrapped.peer)
  }

  private genOpaque (unwrapped: OpaqueUnwrapped): string {
    return this.signBox(this.key, unwrapped)
  }

  private async unwrapOpaque (opaque: string): Promise<OpaqueUnwrapped> {
    const unwrapped = await this.verifyBox(this.key.publicKey, opaque) as any
    if (typeof unwrapped.challengeClient !== 'string' || typeof unwrapped.hostname !== 'string' || typeof unwrapped.creationTime !== 'number') {
      throw new Error('Invalid opaque')
    }
    return unwrapped
  }

  private signBox (key: PrivateKey, data: unknown): string {
    const dataSerialized = JSON.stringify(data)
    const dataBytes = textEncoder.encode(dataSerialized)
    const sig = key.sign(dataBytes)
    const jsonStr = JSON.stringify({
      val: uint8ArrayToString(dataBytes, 'base64urlpad'),
      sig: uint8ArrayToString(sig, 'base64urlpad')
    })
    return uint8ArrayToString(textEncoder.encode(jsonStr), 'base64urlpad')
  }

  private async verifyBox (key: PublicKey, data: string): Promise<unknown> {
    const { sig, val } = JSON.parse(textDecoder.decode(uint8ArrayFromString(data, 'base64urlpad')))
    const valBytes = uint8ArrayFromString(val, 'base64urlpad')
    const sigValid = await key.verify(valBytes, uint8ArrayFromString(sig, 'base64urlpad'))
    if (!sigValid) {
      throw new Error('Invalid signature')
    }
    const valStr = textDecoder.decode(valBytes)
    return JSON.parse(valStr)
  }

  private generateChallenge (): string {
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    return uint8ArrayToString(randomBytes, 'base64urlpad')
  }
}

interface OpaqueUnwrapped {
  challengeClient: string
  clientPublicKey?: string
  hostname: string
  creationTime: number
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

interface AuthenticationResponse {
  status: number
  headers?: Record<string, string>
  peer?: PeerId | undefined
}
