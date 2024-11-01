export type ProtocolID = string
export { WELL_KNOWN_PROTOCOLS } from './constants.js'
export type ProtosMap = Record<ProtocolID, { path: string }>
export class WellKnownHandler {
  private readonly myWellKnownProtos: ProtosMap = {}
  public async handleRequest (request: Request): Promise<Response> {
    return new Response(JSON.stringify(this.myWellKnownProtos), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  // Register a protocol with a path and remember it so we can tell our peers
  // about it via .well-known
  public registerProtocol (protocol: string, path: string): void {
    if (path === '') {
      path = '/'
    }
    if (!path.startsWith('/')) {
      path = `/${path}`
    }

    if (this.myWellKnownProtos[protocol] != null) {
      throw new Error(`Protocol ${protocol} already registered`)
    }
    this.myWellKnownProtos[protocol] = { path }
  }
}
