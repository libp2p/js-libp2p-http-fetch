import http from 'node:http'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { expect } from 'aegir/chai'
import pDefer from 'p-defer'
import { ClientAuth, ServerAuth } from '../src/auth/index.js'
import type { PeerId, PrivateKey } from '@libp2p/interface'

describe('@libp2p/http-fetch', () => {
  describe('client auth', () => {
    let clientKey: PrivateKey
    let serverKey: PrivateKey
    let server: http.Server

    beforeEach(async () => {
      clientKey = await generateKeyPair('Ed25519')
      serverKey = await generateKeyPair('Ed25519')
    })

    afterEach(async () => {
      server?.close()
      server?.closeAllConnections()
    })

    it('should perform auth from client', async () => {
      const clientAuth = new ClientAuth(clientKey)
      const serverAuth = new ServerAuth(serverKey, h => h.startsWith('127.0.0.1'))
      const clientPeer = pDefer<PeerId>()
      const echoListener = serverAuth.requestListener((clientId, req, res) => {
        clientPeer.resolve(clientId)
        req.pipe(res)
      })

      server = http.createServer(echoListener)

      const port = await new Promise<number>((resolve, reject) => {
        const listener = server.listen(0, () => {
          const address = listener.address()

          if (address == null || typeof address === 'string') {
            reject(new Error('Could not listen on port'))
            return
          }

          resolve(address.port)
        })
      })

      await expect(clientAuth.authenticateServer(`http://127.0.0.1:${port}`)).to.eventually.deep.equal(peerIdFromPrivateKey(serverKey))
      await expect(clientPeer.promise).to.eventually.deep.equal(peerIdFromPrivateKey(clientKey))
    })

    it('should respect cookies during auth', async () => {
      const clientAuth = new ClientAuth(clientKey)
      const serverAuth = new ServerAuth(serverKey, h => h.startsWith('127.0.0.1'))
      const cookie = pDefer<string>()
      const echoListener = serverAuth.requestListener((clientId, req, res) => {
        req.pipe(res)
      })
      const cookieName = 'test-cookie-name'
      const cookieValue = 'test-cookie-value'
      let requests = 0

      server = http.createServer((req, res) => {
        requests++

        const cookieHeader = req.headers.cookie

        if (cookieHeader == null) {
          if (requests === 2) {
            cookie.reject(new Error('No cookie header found on second request'))
          }

          res.setHeader('set-cookie', `${cookieName}=${cookieValue}; Expires=${new Date(Date.now() + 86_400_000).toString()}; HttpOnly`)
        } else {
          cookie.resolve(cookieHeader)
        }

        echoListener(req, res)
      })

      const port = await new Promise<number>((resolve, reject) => {
        const listener = server.listen(0, () => {
          const address = listener.address()

          if (address == null || typeof address === 'string') {
            reject(new Error('Could not listen on port'))
            return
          }

          resolve(address.port)
        })
      })

      await expect(clientAuth.authenticateServer(`http://127.0.0.1:${port}`)).to.eventually.deep.equal(peerIdFromPrivateKey(serverKey))
      await expect(cookie.promise).to.eventually.equal(`${cookieName}=${cookieValue}`)
    })
  })
})
