import * as varint from 'uint8-varint'
import type { PrivateKey, PublicKey } from '@libp2p/interface'

export const PeerIDAuthScheme = 'libp2p-PeerID'
export const HTTPPeerIDAuthProto = '/http-peer-id-auth/1.0.0'

export async function sign (key: PrivateKey, prefix: string, partsToSign: Array<[string, string | Uint8Array]>): Promise<Uint8Array> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.sign(dataToSign)
}

export async function verify (key: PublicKey, prefix: string, partsToSign: Array<[string, string | Uint8Array]>, sig: Uint8Array): Promise<boolean> {
  const dataToSign = genDataToSign(prefix, partsToSign)
  return key.verify(dataToSign, sig)
}

export function encodeAuthParams (params: Record<string, string>): string {
  const encodedParams = Object.entries(params)
    .map(([key, value]) => `${key}="${value}"`)
    .join(', ')
  return `${PeerIDAuthScheme} ${encodedParams}`
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

const maxAuthHeaderSize = 2048

export function parseHeader (headerVal: string): Record<string, string> {
  if (headerVal.length > maxAuthHeaderSize) {
    throw new Error('header too long')
  }

  if (!headerVal.includes(PeerIDAuthScheme)) {
    throw new Error('no peer id auth scheme found')
  }

  const rest = headerVal.substring(PeerIDAuthScheme.length).trim()
  const params: Record<string, string> = {}
  const regex = /(\w[^=]+)="([^"]+)"/g
  let match
  while ((match = regex.exec(rest)) !== null) {
    params[match[1]] = match[2]
  }
  return params
}
