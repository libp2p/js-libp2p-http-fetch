import { responseToStream, streamToRequest } from '../utils.js'
import type { Endpoint, HeaderInfo } from '../index.js'
import type { Stream, Connection } from '@libp2p/interface'

export interface Fetch {
  (req: Request): Promise<Response>
}

export interface FetchServerInit {
  server: Fetch
}

export class FetchServer implements Endpoint {
  private readonly server: Fetch

  constructor (init: FetchServerInit) {
    this.server = init.server
  }

  async inject (info: HeaderInfo, stream: Stream, connection: Connection): Promise<void> {
    const res = await this.server(streamToRequest(info, stream))
    await responseToStream(res, stream)
  }
}
