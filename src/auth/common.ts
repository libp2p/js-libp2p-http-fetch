import { unmarshalPublicKey } from '@libp2p/crypto/keys'
import { peerIdFromKeys, peerIdFromString } from '@libp2p/peer-id'
import * as varint from 'uint8-varint'
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays'
import type { PeerId, PrivateKey, PublicKey } from '@libp2p/interface'

export const PeerIDAuthScheme = 'libp2p-PeerID' as const
export const BearerAuthScheme = 'libp2p-Bearer' as const
export const HTTPPeerIDAuthProto = '/http-peer-id-auth/1.0.0' as const

export async function sign (key: PrivateKey, prefix: string, partsToSign: string[]): Promise<Uint8Array> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.sign(dataToSign)
}

export async function verify (key: PublicKey, prefix: string, partsToSign: string[], sig: Uint8Array): Promise<boolean> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.verify(dataToSign, sig)
}

export function formatHeader (prefix: string, params: Record<string, string | undefined>): string {
  const paramString = Object.entries(params).filter(([, v]) => v !== undefined).map(([key, value]) => {
    const valueStr = typeof value === 'string' ? value : uint8ArrayToString(value, 'base64urlpad')
    return `${key}=${valueStr}`
  })
  return `${prefix} ${paramString.join(', ')}`
}

const textEncoder = new TextEncoder()

function genDataToSign (prefix: string, partsToSign: string[]): Uint8Array {
  // Sort the parts
  partsToSign.sort()
  const size = partsToSign.reduce((acc, part) => acc + varint.encodingLength(part.length) + part.length, prefix.length)
  const out = new Uint8Array(size)
  let offset = 0
  const res = textEncoder.encodeInto(prefix, out)
  offset += res.written
  for (const part of partsToSign) {
    varint.encodeUint8Array(part.length, out, offset)
    offset += varint.encodingLength(part.length)
    const res = textEncoder.encodeInto(part, out.subarray(offset))
    offset += res.written
  }
  return out
}

const maxSchemes = 4
const maxParams = 10
const maxAuthHeaderSize = 4096 // Assuming a value for maxAuthHeaderSize since it's not provided in the Go code

const paramRegexStr = '([\\w-]+)=([\\w\\d-_=.]+|"[^"]+")'
const paramRegex = new RegExp(paramRegexStr, 'g')

const authHeaderRegex = new RegExp(`(${BearerAuthScheme}\\s+[^,\\s]+)|(${PeerIDAuthScheme}\\s+((?:${paramRegexStr})(?:\\s*,\\s*)?)*)`, 'g')

type AuthScheme = {
  scheme: typeof PeerIDAuthScheme
  params: Map<string, string>
} | {
  scheme: typeof BearerAuthScheme
  bearerToken: string
}

export function parseHeader (headerVal: string): Map<(typeof PeerIDAuthScheme | typeof BearerAuthScheme), AuthScheme> {
  if (headerVal.length > maxAuthHeaderSize) {
    throw new Error('header too long')
  }

  const schemes = [...headerVal.matchAll(authHeaderRegex)].map(match => match[0])
  if (schemes.length > maxSchemes) {
    throw new Error('too many schemes')
  }

  if (schemes.length === 0) {
    return new Map()
  }

  const out = []
  for (let s of schemes) {
    s = s.trim()
    const schemeEndIdx = s.indexOf(' ')
    if (schemeEndIdx === -1) {
      continue
    }

    const schemeName = s.substring(0, schemeEndIdx)
    switch (schemeName) {
      case BearerAuthScheme:
        break
      case PeerIDAuthScheme:
        break
      default:
        // Ignore unknown schemes
        continue
    }

    const params = s.substring(schemeEndIdx + 1).trim()
    if (schemeName === BearerAuthScheme) {
      out.push({
        scheme: BearerAuthScheme,
        bearerToken: params
      })
      continue
    }

    const matches = [...params.matchAll(paramRegex)]
    if (matches.length > maxParams) {
      throw new Error('too many params')
    }

    const paramMap = new Map()
    for (const match of matches) {
      if (match.length !== 3) {
        throw new Error('invalid param format')
      }
      paramMap.set(match[1], match[2].replace(/^"|"$/g, ''))
    }
    out.push({
      scheme: PeerIDAuthScheme,
      params: paramMap
    })
  }

  if (out.length === 0) {
    return new Map()
  }

  const outMap = new Map()
  for (const scheme of out) {
    outMap.set(scheme.scheme, scheme)
  }
  return outMap
}

interface AuthFields {
  hostname: string
  id: PeerId | undefined
  pubKey: PublicKey | undefined
  opaque: string | undefined
  challengeServerB64: string | undefined
  challengeClientB64: string | undefined
  signature: Uint8Array | undefined
}

export async function parseAuthFields (authHeader: string, hostname: string, isServer: boolean): Promise<AuthFields> {
  if (authHeader === '') {
    throw new Error('Missing auth header')
  }
  if (authHeader.length > maxAuthHeaderSize) {
    throw new Error('Authorization header too large')
  }

  const schemes = parseHeader(authHeader)

  const peerIDAuth = schemes.get(PeerIDAuthScheme)
  if (peerIDAuth === undefined || peerIDAuth.scheme !== PeerIDAuthScheme) {
    throw new Error('No peer ID auth scheme found')
  }

  const sigB64 = peerIDAuth.params.get('sig')
  if (isServer && sigB64 === undefined) {
    throw new Error('No signature found')
  }

  let sig: Uint8Array | undefined
  if (sigB64 !== undefined) {
    sig = uint8ArrayFromString(sigB64, 'base64urlpad')
  }

  let pubKey: Uint8Array | undefined
  let id: PeerId | undefined

  const pubKeyParam = peerIDAuth.params.get('public-key')
  if (pubKeyParam !== undefined) {
    pubKey = uint8ArrayFromString(pubKeyParam, 'base64urlpad')
    if (pubKey !== undefined) {
      id = await peerIdFromKeys(pubKey)
    }
  }

  const peerIDStringFromParam = peerIDAuth.params.get('peer-id')
  if (peerIDStringFromParam === undefined && pubKeyParam !== undefined) {
    throw new Error('Invalid params. No peer ID found but public key is present')
  }
  if (peerIDStringFromParam !== undefined) {
    const peerIdFromParam = peerIdFromString(peerIDStringFromParam)
    if (id !== undefined && !id.equals(peerIdFromParam)) {
      throw new Error('Peer ID from public key does not match given peer ID')
    }
    if (peerIdFromParam.publicKey !== undefined) {
      pubKey = peerIdFromParam.publicKey
    }
    if (id === undefined) {
      id = peerIdFromParam
    }
  }

  const challengeServer = peerIDAuth.params.get('challenge-server')

  let challengeClient
  if (!isServer) {
    // Only parse this for the client. The server should read this from the opaque field
    challengeClient = peerIDAuth.params.get('challenge-client')
  }

  return {
    hostname,
    id,
    pubKey: pubKey !== undefined ? unmarshalPublicKey(pubKey) : undefined,
    opaque: peerIDAuth.params.get('opaque'),
    challengeServerB64: challengeServer,
    challengeClientB64: challengeClient,
    signature: sig
  }
}
