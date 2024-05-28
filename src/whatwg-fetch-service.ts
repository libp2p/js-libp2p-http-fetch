import { multiaddr } from '@multiformats/multiaddr'
import { Uint8ArrayList, isUint8ArrayList } from 'uint8arraylist'
import { PROTOCOL_NAME } from './constants.js'
import { fetchViaDuplex } from './fetch/index.js'
import type { FetchComponents, FetchInit, HTTP as WHATWGFetchInterface } from './index.js'
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

export class WHATWGFetch implements Startable, WHATWGFetchInterface {
  private readonly log: Logger
  public readonly protocol: string = PROTOCOL_NAME
  private readonly components: FetchComponents
  private started: boolean
  private readonly _fetch: (request: Request) => Promise<Response>

  constructor (components: FetchComponents, init: FetchInit = {}) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:whatwg-fetch')
    this.started = false
    if (init.fetch != null) {
      this._fetch = init.fetch
    } else if (typeof globalThis.fetch === 'function') {
      this._fetch = globalThis.fetch
    } else {
      throw new Error('No fetch implementation provided and global fetch is not available')
    }
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
    // const { stream } = data

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
      return this._fetch(request)
    }
  }
}
