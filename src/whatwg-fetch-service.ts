import { multiaddr } from '@multiformats/multiaddr'
import { Uint8ArrayList, isUint8ArrayList } from 'uint8arraylist'
import { PROTOCOL_NAME } from './constants.js'
import { fetchViaDuplex } from './fetch/index.js'
import type { FetchComponents, PerfInit, HTTP as WHATWGFetchInterface } from './index.js'
import type { Logger, Startable } from '@libp2p/interface'
import type { IncomingStreamData } from '@libp2p/interface-internal'

// const CRLF_BYTES = new Uint8Array([13, 10])
const CR_BYTE = 13
const LF_BYTE = 10

// copyUntilCRLF copies bytes from src to dst until a CRLF is encountered. Returns the number of bytes copied.
function copyUntilCRLF (dst: Uint8Array, src: Uint8Array, startOffset: number): number {
  dst.set(src, startOffset)
  let crlfIndex = -1
  for (let i = startOffset - 1; i < startOffset + src.length - 1; i++) {
    if (src[i] === CR_BYTE && src[i + 1] === LF_BYTE) {
      crlfIndex = i
      break
    }
  }
  if (crlfIndex === -1) {
    return src.length
  }
  return crlfIndex - startOffset
}

// copyFromUint8ArrayListUntilCRLF returns the bytes copied (as n), and the rest of the array list (as rest)
function copyFromUint8ArrayListUntilCRLF (dst: Uint8Array, src: Uint8ArrayList, startOffset: number): { n: number, rest: Uint8ArrayList } {
  let bytesCopied = 0
  const rest = new Uint8ArrayList()
  let foundCRLF = false
  for (const chunk of src) {
    if (foundCRLF) {
      rest.append(chunk)
      continue
    }
    const n = copyUntilCRLF(dst, chunk, startOffset)
    bytesCopied += n
    startOffset += n
    if (n < chunk.length) {
      foundCRLF = true
      rest.append(chunk.subarray(n))
      return { n: bytesCopied, rest }
    }
  }
  return { n: bytesCopied, rest }
}

async function readUntilCRLFIntoBuffer (dst: Uint8Array, src: AsyncIterator<Uint8Array | Uint8ArrayList>): Promise<{ n: number, rest: Uint8ArrayList }> {
  let writeOffset = 0
  while (true) {
    const { value: chunk, done } = await src.next()
    if (done != null && done) {
      // No more data
      throw new Error('Unexpected end of stream')
    }
    if (isUint8ArrayList(chunk)) {
      const { n, rest } = copyFromUint8ArrayListUntilCRLF(dst, chunk, writeOffset)
      if (rest.length > 0) {
        // Found CRLF
        return { n: n + writeOffset, rest }
      }
    } else {
      const n = copyUntilCRLF(dst, chunk, writeOffset)
      writeOffset += n
      if (n < chunk.length) {
        // Found CRLF
        return { n: writeOffset, rest: new Uint8ArrayList(chunk.subarray(n)) }
      }
    }
  }
}

export class WHATWGFetch implements Startable, WHATWGFetchInterface {
  private readonly log: Logger
  public readonly protocol: string
  private readonly components: FetchComponents
  private started: boolean

  constructor (components: FetchComponents, init: PerfInit = {}) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:whatwg-fetch')
    this.started = false
    this.protocol = init.protocolName ?? PROTOCOL_NAME
  }

  async start (): Promise<void> {
    await this.components.registrar.handle(this.protocol, (data: IncomingStreamData) => {
      void this.handleMessage(data).catch((err) => {
        this.log.error('error handling perf protocol message', err)
      })
    }, {})
    this.started = true
  }

  async stop (): Promise<void> {
    await this.components.registrar.unhandle(this.protocol)
    this.started = false
  }

  isStarted (): boolean {
    return this.started
  }

  async handleMessage (data: IncomingStreamData): Promise<void> {
    const { stream } = data
    // Parse HTTP/1.1 request
    const buffer = new Uint8Array(16 << 10)
    const { n, rest } = await readUntilCRLFIntoBuffer(buffer, stream.source)
    const requestLine = new TextDecoder().decode(buffer.subarray(0, n))
    const [method, requestTarget, version] = requestLine.split(' ')
    if (version !== 'HTTP/1.1') {
      throw new Error('Unsupported HTTP version')
    }

    // eslint-disable-next-line no-console
    console.log(method, requestTarget, rest)

    //  todo
    // const { n, rest } = copyFromUint8ArrayListUntilCRLF(buffer, rest)

    // Read headers
    // const headers = new Headers()

    // Create a request object
    // const req = new Request(requestTarget, {
    //   method

    // })

    throw new Error('Not implemented')
  }

  async fetch (request: Request): Promise<Response> {
    // Get the peer from the request
    const { url } = request
    if (url.startsWith('multiaddr:')) {
      const ma = url.substring('multiaddr:'.length)
      const conn = await this.components.connectionManager.openConnection(multiaddr(ma))
      const s = await conn.newStream(PROTOCOL_NAME)
      return fetchViaDuplex(s)(request)
    } else {
      // Use browser fetch or polyfill...
      throw new Error('Not implemented')
    }
  }
}
