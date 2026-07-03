import { InvalidMessageError } from '@libp2p/interface'
import * as varint from 'uint8-varint'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import { PEER_ID_AUTH_SCHEME } from './index.ts'
import type { OpaqueDataHeader } from './index.ts'
import type { PeerId, PrivateKey, PublicKey } from '@libp2p/interface'

export interface OpaqueUnwrapped {
  challengeClient: string
  clientPublicKey?: string
  hostname: string
  creationTime: number
}

export const MAX_AUTH_HEADER_SIZE = 2048

export function generateChallenge (): string {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  return uint8ArrayToString(randomBytes, 'base64urlpad')
}

export function encodeAuthParams (params: Record<string, string>): string {
  const encodedParams = Object.entries(params)
    .map(([key, value]) => `${key}="${value}"`)
    .join(', ')

  return `${PEER_ID_AUTH_SCHEME} ${encodedParams}`
}

export async function sign (key: PrivateKey, prefix: string, partsToSign: Array<[string, string | Uint8Array]>): Promise<Uint8Array> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.sign(dataToSign)
}

export async function verify (key: PublicKey, prefix: string, partsToSign: Array<[string, string | Uint8Array]>, sig: Uint8Array): Promise<boolean> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.verify(dataToSign, sig)
}

const textEncoder = new TextEncoder()

function sizeOfPart ([k, v]: [string, string | Uint8Array]): number {
  return k.length + 1 + v.length // key + '=' + value
}

function genDataToSign (prefix: string, partsToSign: Array<[string, string | Uint8Array]>): Uint8Array {
  // Sort the parts
  partsToSign.sort((a, b) => a[0].localeCompare(b[0]))

  const size = partsToSign.reduce((acc, p) => acc + varint.encodingLength(sizeOfPart(p)) + sizeOfPart(p), prefix.length)
  const out = new Uint8Array(size)
  let offset = 0
  const res = textEncoder.encodeInto(prefix, out)
  offset += res.written

  for (const [k, v] of partsToSign) {
    const len = sizeOfPart([k, v])
    varint.encodeUint8Array(len, out, offset)
    offset += varint.encodingLength(len)
    let res = textEncoder.encodeInto(k, out.subarray(offset))
    offset += res.written
    res = textEncoder.encodeInto('=', out.subarray(offset))
    offset += res.written

    if (typeof v === 'string') {
      res = textEncoder.encodeInto(v, out.subarray(offset))
      offset += res.written
    } else {
      out.set(v, offset)
      offset += v.length
    }
  }

  return out
}

export function decodeAuthorizationHeader (header: string): unknown {
  if (header.length < PEER_ID_AUTH_SCHEME.length + 1) {
    throw new InvalidMessageError('Authorization header too short')
  }

  if (header.length > MAX_AUTH_HEADER_SIZE) {
    throw new InvalidMessageError('Authorization header too long')
  }

  if (!header.includes(PEER_ID_AUTH_SCHEME)) {
    throw new InvalidMessageError('No peer id auth scheme found')
  }

  const rest = header.substring(PEER_ID_AUTH_SCHEME.length).trim()
  const params: Record<string, string> = {}
  const regex = /(\w[^=]+)="([^"]+)"/g

  let match
  while ((match = regex.exec(rest)) !== null) {
    params[match[1]] = match[2]
  }

  return params
}

export async function genOpaque (privateKey: PrivateKey, unwrapped: OpaqueUnwrapped): Promise<string> {
  return signBox(privateKey, unwrapped)
}

export async function unwrapOpaque (publicKey: PublicKey, data: OpaqueDataHeader): Promise<OpaqueUnwrapped> {
  const unwrapped = await verifyBox(publicKey, data.opaque) as any

  if (typeof unwrapped.challengeClient !== 'string' || typeof unwrapped.hostname !== 'string' || typeof unwrapped.creationTime !== 'number') {
    throw new Error('Invalid opaque')
  }

  return unwrapped
}

export async function signBox (key: PrivateKey, data: unknown): Promise<string> {
  const dataSerialized = JSON.stringify(data)
  const dataBytes = uint8ArrayFromString(dataSerialized)
  const sig = await key.sign(dataBytes)
  const jsonStr = JSON.stringify({
    val: uint8ArrayToString(dataBytes, 'base64urlpad'),
    sig: uint8ArrayToString(sig, 'base64urlpad')
  })

  return uint8ArrayToString(uint8ArrayFromString(jsonStr), 'base64urlpad')
}

export async function verifyBox (key: PublicKey, data: string): Promise<unknown> {
  const { sig, val } = JSON.parse(uint8ArrayToString(uint8ArrayFromString(data, 'base64urlpad')))
  const valBytes = uint8ArrayFromString(val, 'base64urlpad')
  const sigValid = await key.verify(valBytes, uint8ArrayFromString(sig, 'base64urlpad'))

  if (!sigValid) {
    throw new Error('Invalid signature')
  }

  const valStr = uint8ArrayToString(valBytes)
  return JSON.parse(valStr)
}

export async function genBearerToken (serverKey: PrivateKey, clientPeerId: PeerId, hostname: string): Promise<string> {
  return signBox(serverKey, {
    peer: clientPeerId.toString(),
    h: hostname,
    t: Date.now()
  })
}
