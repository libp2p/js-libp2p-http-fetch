import { Agent as NodeAgent } from 'node:http'
import { Libp2pSocket, toResource } from '@libp2p/http-utils'
import { isPeerId } from '@libp2p/interface'
import { Agent as UndiciAgent } from 'undici'
import { HTTP_PROTOCOL } from './constants.ts'
import { HTTP as HTTPBrowser } from './http.browser.ts'
import type { HTTP as HTTPInterface } from './index.ts'
import type { AbortOptions, PeerId } from '@libp2p/interface'
import type { ConnectionManager, Registrar } from '@libp2p/interface-internal'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Agent, AgentOptions } from 'node:http'
import type { Socket, TcpNetConnectOpts } from 'node:net'
import type { Duplex } from 'node:stream'
import type { Dispatcher } from 'undici'

export type { HTTPComponents } from './http.browser.ts'

function createConnection (connectionManager: ConnectionManager, peer: PeerId | Multiaddr | Multiaddr[], options?: AbortOptions): Socket {
  return new Libp2pSocket(
    Promise.resolve()
      .then(async () => {
        const connection = await connectionManager.openConnection(peer, options)
        const stream = await connection.newStream(HTTP_PROTOCOL, options)

        return { stream, connection }
      })
  )
}

interface HTTPDispatcherComponents {
  connectionManager: ConnectionManager
}

interface HTTPDispatcherInit extends UndiciAgent.Options {
  peer: PeerId | Multiaddr | Multiaddr[]
}

export class Libp2pDispatcher extends UndiciAgent {
  constructor (components: HTTPDispatcherComponents, init: HTTPDispatcherInit) {
    super({
      ...init,
      connect: (options, cb) => {
        const socket = createConnection(components.connectionManager, init.peer, {
          // @ts-expect-error types are wonky
          signal: options.timeout != null ? AbortSignal.timeout(options.timeout) : undefined
        })

        const onConnect = (): void => {
          socket.removeListener('error', onError)
          socket.removeListener('connect', onConnect)
          cb(null, socket)
        }
        const onError = (err: Error): void => {
          socket.removeListener('error', onError)
          socket.removeListener('connect', onConnect)
          cb(err, null)
        }

        socket.addListener('connect', onConnect)
        socket.addListener('error', onError)
      }
    })
  }
}

interface HTTPAgentComponents {
  connectionManager: ConnectionManager
}

interface HTTPAgentInit extends AgentOptions {
  peer: PeerId | Multiaddr | Multiaddr[]
}

class Libp2pAgent extends NodeAgent {
  public readonly keepAliveMsecs: number = 100
  private readonly components: HTTPAgentComponents
  private readonly peer: PeerId | Multiaddr | Multiaddr[]

  constructor (components: HTTPAgentComponents, init: HTTPAgentInit) {
    super(init)
    this.components = components
    this.peer = init.peer
  }

  createConnection (options: TcpNetConnectOpts, cb: (err: Error | null, socket: Duplex) => void): Duplex {
    const socket = createConnection(this.components.connectionManager, this.peer, options)

    const onConnect = (): void => {
      socket.removeListener('error', onError)
      socket.removeListener('connect', onConnect)
      cb(null, socket)
    }
    const onError = (err: Error): void => {
      socket.removeListener('error', onError)
      socket.removeListener('connect', onConnect)
      cb(err, socket)
    }

    socket.addListener('connect', onConnect)
    socket.addListener('error', onError)

    return socket
  }
}

export interface HTTPClientComponents {
  registrar: Registrar
  connectionManager: ConnectionManager
}

export class HTTP extends HTTPBrowser implements HTTPInterface {
  agent (peer: PeerId | Multiaddr | Multiaddr[], options?: AgentOptions): Agent {
    if (!isPeerId(peer) && toResource(peer) instanceof URL) {
      return new NodeAgent(options)
    }

    return new Libp2pAgent(this.components, {
      ...options,
      peer
    })
  }

  dispatcher (peer: PeerId | Multiaddr | Multiaddr[], options?: UndiciAgent.Options): Dispatcher {
    if (!isPeerId(peer) && toResource(peer) instanceof URL) {
      return new UndiciAgent(options)
    }

    return new Libp2pDispatcher(this.components, {
      ...options,
      peer
    })
  }
}
