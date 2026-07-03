import { createServerChallenge, serverResponds } from '@libp2p/http-peer-id-auth'
import { normalizeMethod } from '@libp2p/http-utils'
import { WEBSOCKET_HANDLER } from '../constants.ts'
import { initializeRoute } from './utils.ts'
import { webSocketRoute } from './websocket.ts'
import type { HTTPRoute, HandlerRoute } from '../index.ts'
import type { ComponentLogger, Logger, PeerId, PrivateKey } from '@libp2p/interface'

export const DEFAULT_AUTH_TOKEN_TTL = 60 * 60 * 1000 // 1 hour

interface PeerIdAuthComponents {
  privateKey: PrivateKey
  logger: ComponentLogger
}

interface AuthenticationResult {
  status: number
  headers?: Headers
  peer?: PeerId | undefined
}

interface PeerIdAuthInit {
  tokenTTL?: number
  verifyHostname?(hostname: string): boolean | Promise<boolean>

  /**
   * If true, and the client has not initiated the HTTP PeerId Auth handshake,
   * have the server do it.
   *
   * @default true
   */
  requireAuth?: boolean
}

export class PeerIdAuth {
  private readonly components: PeerIdAuthComponents
  public readonly log: Logger
  private readonly tokenTTL: number
  private readonly verifyHostname: (hostname: string) => boolean | Promise<boolean>
  private readonly requireAuth: boolean

  constructor (components: PeerIdAuthComponents, init: PeerIdAuthInit) {
    this.components = components
    this.log = components.logger.forComponent('libp2p:http:server-peer-id-auth')
    this.tokenTTL = init.tokenTTL ?? DEFAULT_AUTH_TOKEN_TTL
    this.requireAuth = init.requireAuth ?? true
    this.verifyHostname = init.verifyHostname ?? (() => true)
  }

  public async authenticateRequest (hostname: string, method: string, authHeader?: string | null): Promise<AuthenticationResult> {
    if (!(await this.verifyHostname(hostname))) {
      this.log.error('hostname verification failed')
      return { status: 400 }
    }

    if (authHeader == null || authHeader === '') {
      // OPTIONS is used by preflight request - cannot enforce auth on it as
      // browsers throw "failed to fetch" errors
      if (method === 'OPTIONS' || this.requireAuth === false) {
        return { status: 200 }
      }

      return this.returnChallenge(hostname)
    }

    try {
      const result = await serverResponds(authHeader, hostname, this.components.privateKey, this.tokenTTL)
      const headers = new Headers()

      let status = 200

      if (result.info != null) {
        headers.set('authentication-info', result.info)
        headers.set('access-control-expose-headers', 'authentication-info')
      }

      if (result.authenticate != null) {
        status = 401
        headers.set('www-authenticate', result.authenticate)
        headers.set('access-control-expose-headers', 'www-authenticate')
      }

      return {
        status,
        headers,
        peer: result.peerId
      }
    } catch (err: any) {
      this.log.error('failed to respond to client challenge - %e', err)

      if (err.name === 'InvalidMessageError') {
        return { status: 400 }
      }

      if (err.name === 'NotAuthenticatedError') {
        return this.returnChallenge(hostname)
      }

      throw err
    }
  }

  private async returnChallenge (hostname: string): Promise<AuthenticationResult> {
    return {
      status: 401,
      headers: new Headers({
        'www-authenticate': await createServerChallenge(hostname, this.components.privateKey),
        'access-control-expose-headers': 'www-authenticate'
      })
    }
  }
}

export interface AuthenticationOptions {
  /**
   * How long in ms an auth token for a server will be valid for, defaults to
   * one hour
   *
   * @default 360_000
   */
  tokenTTL?: number

  /**
   * An optional function that can be used to verify that the hostname of the
   * incoming request is valid and supported
   */
  verifyHostname?(hostname: string): boolean | Promise<boolean>

  /**
   * If true the request will be rejected if the client does not supply an
   * `Authorization` header, pass `false` here to attempt to verify the client
   * but allow the request to proceed if it fails
   *
   * @default true
   */
  requireAuth?: boolean
}

export interface OptionalAuthenticationOptions extends AuthenticationOptions {
  /**
   * If true the request will be rejected if the client does not supply an
   * `Authorization` header, pass `false` here to attempt to verify the client
   * but allow the request to proceed if it fails
   *
   * @default true
   */
  requireAuth: false
}

export interface AuthenticatedWebSocketOptions extends AuthenticationOptions {
  /**
   * If the request was not a WebSocket request, invoke this method
   */
  fallback?: AuthenticatedHTTPRequestHandler

  /**
   * The maximum message size to be sent or received over the socket in bytes
   *
   * @default 10_485_760
   */
  maxMessageSize?: number
}

export interface OptionallyAuthenticatedWebSocketOptions extends OptionalAuthenticationOptions {
  /**
   * If the request was not a WebSocket request, invoke this method
   */
  fallback?: OptionallyAuthenticatedHTTPRequestHandler

  /**
   * The maximum message size to be sent or received over the socket in bytes
   *
   * @default 10_485_760
   */
  maxMessageSize?: number
}

/**
 * An HTTP handler that accepts the PeerId of the client as an argument
 */
export interface AuthenticatedHTTPRequestHandler {
  (req: Request, peerId: PeerId): Promise<Response>
}

/**
 * An HTTP handler that accepts the PeerId of the client as an argument, if they
 * provided a valid Authorization header
 */
export interface OptionallyAuthenticatedHTTPRequestHandler {
  (req: Request, peerId?: PeerId): Promise<Response>
}

/**
 * An WebSocket handler that accepts the PeerId of the client as an argument
 */
export interface AuthenticatedWebSocketHandler {
  (socket: WebSocket, peerId: PeerId): void
}

/**
 * An WebSocket handler that accepts the PeerId of the client as an argument, if
 * they provided a valid Authorization header
 */
export interface OptionallyAuthenticatedWebSocketHandler {
  (socket: WebSocket, peerId?: PeerId): void
}

function isOptionalAuth (obj: any): obj is OptionallyAuthenticatedHandler {
  return obj.requireAuth === false
}

async function authenticate (req: Request, authResult: AuthenticationResult, handlerMethods: string[], next: AuthenticatedHandler): Promise<Response>
async function authenticate (req: Request, authResult: AuthenticationResult, handlerMethods: string[], next: OptionallyAuthenticatedHandler): Promise<Response>
async function authenticate (req: Request, authResult: AuthenticationResult, handlerMethods: string[], next: AuthenticatedHandler | OptionallyAuthenticatedHandler): Promise<Response> {
  const authIsOptional = isOptionalAuth(next)

  if (!authIsOptional && (authResult.peer == null || authResult.status !== 200)) {
    return new Response(undefined, {
      status: authResult.status,
      headers: authResult.headers
    })
  }

  if (!handlerMethods.includes(req.method)) {
    // handle auth requests
    let res: Response

    if (req.method === 'OPTIONS') {
      // support OPTIONS if the handler doesn't
      res = new Response(undefined, {
        status: 204,
        headers: authResult.headers
      })
    } else {
      // unsupported method
      res = new Response(undefined, {
        status: 405
      })
    }

    // add auth headers to response
    if (authResult.headers !== undefined) {
      for (const [key, value] of authResult.headers) {
        res.headers.set(key, value)
      }
    }

    return res
  }

  // @ts-expect-error cannot derive handler type
  return next.handler(req, authResult.peer)
}

type OptionallyAuthenticatedHandler = HandlerRoute<OptionallyAuthenticatedHTTPRequestHandler> & OptionalAuthenticationOptions
type AuthenticatedHandler = HandlerRoute<AuthenticatedHTTPRequestHandler> & AuthenticationOptions

type OptionallyAuthenticatedEndpoint = HTTPRoute<OptionallyAuthenticatedHTTPRequestHandler> & OptionalAuthenticationOptions
type AuthenticatedEndpoint = HTTPRoute<AuthenticatedHTTPRequestHandler> & AuthenticationOptions

/**
 * Attempt to authenticate the client before request processing to discover
 * their PeerID.
 *
 * If the `requireAuth` option is false, no authentication will be attempted
 * unless the client initiates it.
 *
 * If it is `true` or `undefined`, the server will initiate the authentication
 * handshake if the client has not done so.
 *
 * @see https://github.com/libp2p/specs/blob/master/http/peer-id-auth.md
 */
export function authenticatedRoute (handler: OptionallyAuthenticatedEndpoint): HTTPRoute
export function authenticatedRoute (handler: AuthenticatedEndpoint): HTTPRoute
export function authenticatedRoute (handler: OptionallyAuthenticatedEndpoint | AuthenticatedEndpoint): HTTPRoute {
  const handlerMethods: string[] = normalizeMethod(handler.method)

  return {
    path: handler.path,
    method: ['OPTIONS', ...handlerMethods],
    cors: handler.cors,
    init: (components: PeerIdAuthComponents) => {
      const auth = new PeerIdAuth(components, handler)
      const next = initializeRoute<AuthenticatedHTTPRequestHandler | OptionallyAuthenticatedHTTPRequestHandler>(handler, components)

      return async (req: Request): Promise<Response> => {
        const authResult = await auth.authenticateRequest(readHostname(req), req.method, req.headers.get('Authorization'))

        return authenticate(req, authResult, handlerMethods, next)
      }
    }
  }
}

type OptionallyAuthenticatedWebSocketEndpoint = HTTPRoute<OptionallyAuthenticatedWebSocketHandler> & OptionallyAuthenticatedWebSocketOptions
type AuthenticatedWebSocketEndpoint = HTTPRoute<AuthenticatedWebSocketHandler> & AuthenticatedWebSocketOptions

/**
 * Attempt to authenticate the client before request processing to discover
 * their PeerID.
 *
 * The authorization token should be passed as a protocol prefixed with
 * `authorization=`.
 *
 * To allow use of actual protocol field, multiple values should be
 * comma-delimited, e.g. `authorization=foo,actual,useful,protocols`
 *
 * @see https://github.com/libp2p/specs/blob/master/http/peer-id-auth.md
 */
export function authenticatedWebSocketRoute (handler: OptionallyAuthenticatedWebSocketEndpoint): HTTPRoute
export function authenticatedWebSocketRoute (handler: AuthenticatedWebSocketEndpoint): HTTPRoute
export function authenticatedWebSocketRoute (handler: OptionallyAuthenticatedWebSocketEndpoint | AuthenticatedWebSocketEndpoint): HTTPRoute {
  const handlerMethods: string[] = normalizeMethod(handler.method)

  const output: HTTPRoute = {
    path: handler.path,
    method: ['OPTIONS', ...handlerMethods],
    cors: handler.cors,
    init: (components: PeerIdAuthComponents) => {
      const auth = new PeerIdAuth(components, handler)
      const next: any = initializeRoute<any>(handler, components)

      // allow invoking the handler with a pre-upgraded socket
      output[WEBSOCKET_HANDLER] = (ws) => {
        // need to read the authorization header from the websocket protocol

        // TODO: we should have a way of doing this before the websocket upgrade
        // has been negotiated
        auth.authenticateRequest(readHostname(ws), '', readProtocol(ws))
          .then(authResult => {
            next.handler(ws, authResult.peer)
          })
          .catch(() => {
            ws.close()
          })
      }

      return async (req: Request): Promise<Response> => {
        const authResult = await auth.authenticateRequest(readHostname(req), req.method, readAuthorization(req) ?? readSecWebSocketProtocol(req))

        return authenticate(req, authResult, handlerMethods, {
          ...next,
          handler: async (req, peerId) => {
            const wsRoute = initializeRoute(webSocketRoute({
              ...next,
              handler: (ws) => {
                next.handler(ws, peerId)
              },
              fallback: next.fallback == null
                ? undefined
                : async (req: Request): Promise<Response> => {
                  return authenticate(req, authResult, handlerMethods, {
                    ...next,
                    handler: async (res, peerId) => {
                      if (next.fallback == null) {
                        // should not get here because we have already
                        // null-guarded on `handler.fallback`
                        return new Response(undefined, {
                          status: 500
                        })
                      }

                      return next.fallback(res, peerId)
                    }
                  })
                }
            }), components)

            return wsRoute.handler(req)
          }
        })
      }
    }
  }

  return output
}

function readHostname (req: { url: string }): string {
  const url = new URL(req.url)
  let hostname = url.hostname

  if (url.port === '' || url.port === undefined) {
    return hostname
  }

  if (url.protocol === 'http:' && url.port !== '80') {
    hostname += ':' + url.port
  }

  if (url.protocol === 'https:' && url.port !== '443') {
    hostname += ':' + url.port
  }

  if (hostname === '') {
    throw new Error('No hostname')
  }

  return hostname
}

function readAuthorization (req: Request): string | undefined {
  const authorization = req.headers.get('Authorization')

  if (authorization == null) {
    return
  }

  return authorization
}

export const SEC_WEBSOCKET_PROTOCOL_PREFIX = 'authorization='

function readSecWebSocketProtocol (req: Request): string | undefined {
  const protocol = req.headers.get('Sec-WebSocket-Protocol')

  if (protocol == null) {
    return
  }

  const protos = protocol.split(',')

  const authorization = protos
    .filter(p => p.startsWith(SEC_WEBSOCKET_PROTOCOL_PREFIX))
    .pop()

  // remove authorization field from protocol if present
  if (authorization != null) {
    req.headers.set('Sec-WebSocket-Protocol', protos
      .filter(p => !p.startsWith(SEC_WEBSOCKET_PROTOCOL_PREFIX))
      .join(','))
  }

  if (authorization == null) {
    return
  }

  return atob(authorization.substring(SEC_WEBSOCKET_PROTOCOL_PREFIX.length))
}

function readProtocol (ws: { protocol?: string }): string | undefined {
  const protocol = ws.protocol

  if (protocol == null) {
    return
  }

  const protos = protocol.split(',')

  const authorization = protos
    .filter(p => p.startsWith(SEC_WEBSOCKET_PROTOCOL_PREFIX))
    .pop()

  // remove authorization field from protocol if present
  if (authorization != null) {
    ws.protocol = protos
      .filter(p => !p.startsWith(SEC_WEBSOCKET_PROTOCOL_PREFIX))
      .join(',')
  }

  if (authorization == null) {
    return
  }

  return atob(authorization.substring(SEC_WEBSOCKET_PROTOCOL_PREFIX.length))
}
