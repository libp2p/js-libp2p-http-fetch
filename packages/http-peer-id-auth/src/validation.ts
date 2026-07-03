import { InvalidMessageError } from '@libp2p/interface'
import type { OpaqueUnwrapped } from './utils.ts'

export function validateOpaqueData (opaque: OpaqueUnwrapped, hostname: string, tokenTTL: number): void {
  if (opaque.hostname !== hostname) {
    throw new InvalidMessageError('Invalid hostname')
  }

  // verify signature
  if (opaque.challengeClient == null) {
    throw new InvalidMessageError('Missing challenge-client')
  }

  if (Date.now() - opaque.creationTime > tokenTTL) {
    throw new InvalidMessageError('Token expired')
  }
}
