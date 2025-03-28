export type ProtocolID = string

export interface ProtocolLocation {
  path: string
}

export type ProtocolMap = Record<ProtocolID, ProtocolLocation>
export class WellKnownHandler {
  private readonly protocols: ProtocolMap = {}
  public async handleRequest (request: Request): Promise<Response> {
    return new Response(JSON.stringify(this.protocols), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Register a protocol with a path and remember it so we can tell our peers
   * about it via a request to "/.well-known/libp2p/protocols"
   */
  public registerProtocol (protocol: string, path: string): void {
    if (path === '') {
      path = '/'
    }

    if (!path.startsWith('/')) {
      path = `/${path}`
    }

    if (this.protocols[protocol] != null) {
      throw new Error(`Protocol ${protocol} already registered`)
    }

    this.protocols[protocol] = { path }
  }
}
