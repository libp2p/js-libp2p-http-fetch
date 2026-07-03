/**
 * @packageDocumentation
 *
 * This module exports several utility functions to make creating HTTP servers
 * that run over HTTP quick and easy.
 *
 * @example Create a Node.js server
 *
 * ```ts
 * import { createLibp2p } from 'libp2p'
 * import { http } from '@libp2p/http'
 * import { nodeServer } from '@libp2p/http-server'
 * import { createServer } from 'node:http'
 *
 * const server = createServer((req, res) => {
 *   res.write('Hello world!')
 *   res.end()
 * })
 *
 * const node = await createLibp2p({
 *   // ...other settings
 *   services: {
 *     http: http({
 *       server: nodeServer(server)
 *     })
 *   }
 * })
 * ```
 *
 * @example Create a Node.js server in a browser
 *
 * The previous example can also run in a non-Node.js environment by using the
 * supplied `createServer` function which implements the same API as Node.js
 * just without depending on any Node.js internals.
 *
 * ```ts
 * import { createServer } from '@libp2p/http-server/node'
 *
 * const server = createServer((req, res) => {
 *   res.write('Hello world!')
 *   res.end()
 * })
 * ```
 */

export { fetchServer } from './fetch-server.ts'
export { nodeServer } from './node-server.ts'
