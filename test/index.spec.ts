/* eslint-env mocha */

import { defaultLogger } from '@libp2p/logger'
// @ts-expect-error missing types
import { milo } from '@perseveranza-pets/milo/index-with-wasm.js'
import { stubInterface, type StubbedInstance } from 'sinon-ts'
import type { ComponentLogger } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'

interface StubbedPerfComponents {
  registrar: StubbedInstance<Registrar>
  connectionManager: StubbedInstance<ConnectionManager>
  logger: ComponentLogger
}

export function createComponents (): StubbedPerfComponents {
  return {
    registrar: stubInterface<Registrar>(),
    connectionManager: stubInterface<ConnectionManager>(),
    logger: defaultLogger()
  }
}

describe('whatwg-fetch', () => {
  beforeEach(async () => {
  })

  afterEach(async () => {
  })

  it('should do something', async () => {
    // Prepare a message to parse.
    const message = new TextEncoder().encode('HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabc')

    // Allocate a memory in the WebAssembly space. This speeds up data copying to the WebAssembly layer.
    const ptr = milo.alloc(message.length)

    // Create a buffer we can use normally.
    const buffer = new Uint8Array(milo.memory.buffer, ptr, message.length)

    // Create the parser.
    const parser = milo.create()

    /*
  Milo works using callbacks.

  All callbacks have the same signature, which characterizes the payload:

    * The current parent
    * from: The payload offset.
    * size: The payload length.

  The payload parameters above are relative to the last data sent to the milo.parse method.

  If the current callback has no payload, both values are set to 0.
*/
    milo.setOnData(parser, (p: number, from: number, size: number) => {
      // eslint-disable-next-line no-console
      console.log(`Pos=${milo.getPosition(p)} Body: ${message.slice(from, from + size).toString()}`)
    })

    // Now perform the main parsing using milo.parse. The method returns the number of consumed characters.
    buffer.set(message, 0)
    milo.parse(parser, ptr, message.length)

    // Cleanup used resources.
    milo.destroy(parser)
    milo.dealloc(ptr, message.length)
  })
})
