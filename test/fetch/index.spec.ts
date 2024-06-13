/* eslint-disable no-console */
/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { duplexPair } from 'it-pair/duplex'
import { type Uint8ArrayList, isUint8ArrayList } from 'uint8arraylist'
import { fetchViaDuplex, handleRequestViaDuplex } from '../../src/fetch/index.js'
import { cases } from './cases/cases.js'

describe('Roundtrips', () => {
  it('handles a simple GET request', async () => {
    const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()

    const serverHandler = handleRequestViaDuplex(server, async (req) => {
      console.log('Got request', req)
      return new Response('Hello World')
    }).catch((err) => {
      console.error('Error handling request', err)
      throw err
    })

    const resp = await fetchViaDuplex(client)(new Request('https://example.com/'))
    expect(await resp.text()).to.equal('Hello World')

    // Assert we didn't fail here
    await serverHandler
  })
})

describe('Make a fetch request via duplex', () => {
  it('A simple GET request', async () => {
    const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
    const respPromise = fetchViaDuplex(client)(new Request('http://example.com/'))

    let reqToServer = ''
    const decoder = new TextDecoder()
    for await (const chunk of server.source) {
      if (isUint8ArrayList(chunk)) {
        throw new Error('Should not be a Uint8ArrayList')
      }
      reqToServer += decoder.decode(chunk)
    }

    console.log(reqToServer)
    expect(reqToServer).to.equal('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n')

    void server.sink((async function * () {
      yield new TextEncoder().encode('HTTP/1.1 200 OK\r\n\r\n')
    })())
    const resp = await respPromise
    expect(resp.status).to.equal(200)
  })

  it('A simple GET request with headers', async () => {
    const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
    const respPromise = fetchViaDuplex(client)(new Request('http://example.com/', { headers: { 'X-Test': 'foo' } }))

    let reqToServer = ''
    const decoder = new TextDecoder()
    for await (const chunk of server.source) {
      if (isUint8ArrayList(chunk)) {
        throw new Error('Should not be a Uint8ArrayList')
      }
      reqToServer += decoder.decode(chunk)
    }

    expect(reqToServer).to.equal('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\nx-test: foo\r\n\r\n')

    void server.sink((async function * () {
      yield new TextEncoder().encode('HTTP/1.1 200 OK\r\nX-test: bar\r\n\r\n')
    })())
    const resp = await respPromise
    expect(resp.status).to.equal(200)
    expect(resp.headers.get('x-test')).to.equal('bar')
  })

  it('Post some data', async () => {
    const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
    const respPromise = fetchViaDuplex(client)(new Request('http://example.com/?foo=bar', { method: 'POST', headers: { 'X-Test': 'foo' }, body: 'hello world' }))

    let reqToServer = ''
    const decoder = new TextDecoder()
    for await (const chunk of server.source) {
      if (isUint8ArrayList(chunk)) {
        throw new Error('Should not be a Uint8ArrayList')
      }
      reqToServer += decoder.decode(chunk)
    }

    console.log(reqToServer)
    expect(reqToServer).to.equal('POST /?foo=bar HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\ncontent-type: text/plain;charset=UTF-8\r\nx-test: foo\r\nTransfer-Encoding: chunked\r\n\r\nb\r\nhello world\r\n0\r\n\r\n')

    void server.sink((async function * () {
      yield new TextEncoder().encode('HTTP/1.1 200 OK\r\nX-test: bar\r\n\r\nbaz')
    })())
    const resp = await respPromise
    expect(resp.status).to.equal(200)
    expect(resp.headers.get('x-test')).to.equal('bar')
    expect(await resp.text()).to.equal('baz')
  })

  it('Handles trash', async () => {
    const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
    const respPromise = fetchViaDuplex(client)(new Request('http://example.com/'))

    let reqToServer = ''
    const decoder = new TextDecoder()
    for await (const chunk of server.source) {
      if (isUint8ArrayList(chunk)) {
        throw new Error('Should not be a Uint8ArrayList')
      }
      reqToServer += decoder.decode(chunk)
    }

    expect(reqToServer).to.equal('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n')

    void server.sink((async function * () {
      yield new TextEncoder().encode('FOOOOOOOOOOOOOOOOo')
    })())
    await expect(respPromise).to.eventually.be.rejected()
  })

  it('Message comes in a trickle', async () => {
    for (const httpCase of cases.filter(c => c.type === 'RESPONSE' && c.mayFail !== true)) {
      const expectedStatusCode = httpCase.statusCode
      if (expectedStatusCode === undefined || expectedStatusCode === null) {
        continue
      }
      if (expectedStatusCode < 200 || expectedStatusCode >= 600) {
        // Response object doesn't parse these
        continue
      }
      if (httpCase?.httpMajor !== 1 || httpCase?.httpMinor !== 1) {
        // We don't use anything but HTTP/1.1
        continue
      }
      const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
      // Request doesn't matter
      const respPromise = fetchViaDuplex(client)(new Request('http://example.com/'))

      let reqToServer = ''
      const decoder = new TextDecoder()
      for await (const chunk of server.source) {
        if (isUint8ArrayList(chunk)) {
          throw new Error('Should not be a Uint8ArrayList')
        }
        reqToServer += decoder.decode(chunk)
      }
      expect(reqToServer).to.equal('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n')

      void server.sink((async function * () {
        const rawHttp = new TextEncoder().encode(httpCase.raw)
        // Trickle the response 1 byte at a time
        for (let i = 0; i < rawHttp.length; i++) {
          yield rawHttp.subarray(i, i + 1)
        }
      })())
      const resp = await respPromise

      expect(resp.status).to.equal(expectedStatusCode)
      const chunk = <T>(arr: T[], size: number): T[][] => arr.reduce<T[][]>((chunks, el, i) => i % size === 0 ? [...chunks, [el]] : (chunks[chunks.length - 1].push(el), chunks), [])
      for (const [key, value] of chunk<string>(httpCase.headers, 2)) {
        expect(resp.headers.get(key)).to.equal(value)
      }

      expect(await resp.text()).to.equal(httpCase.body ?? '')
    }
  })

  it('Parses all responses', async () => {
    for (const httpCase of cases.filter(c => c.type === 'RESPONSE' && c.mayFail !== true)) {
      const expectedStatusCode = httpCase.statusCode
      if (expectedStatusCode === undefined || expectedStatusCode === null) {
        continue
      }
      if (expectedStatusCode < 200 || expectedStatusCode >= 600) {
        // Response object doesn't parse these
        continue
      }
      if (httpCase?.httpMajor !== 1 || httpCase?.httpMinor !== 1) {
        // We don't use anything but HTTP/1.1
        continue
      }
      const [client, server] = duplexPair<Uint8Array | Uint8ArrayList>()
      // Request doesn't matter
      const respPromise = fetchViaDuplex(client)(new Request('http://example.com/'))

      let reqToServer = ''
      const decoder = new TextDecoder()
      for await (const chunk of server.source) {
        if (isUint8ArrayList(chunk)) {
          throw new Error('Should not be a Uint8ArrayList')
        }
        reqToServer += decoder.decode(chunk)
      }
      expect(reqToServer).to.equal('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n')

      void server.sink((async function * () {
        yield new TextEncoder().encode(httpCase.raw)
      })())
      const resp = await respPromise

      expect(resp.status).to.equal(expectedStatusCode)
      const chunk = <T>(arr: T[], size: number): T[][] => arr.reduce<T[][]>((chunks, el, i) => i % size === 0 ? [...chunks, [el]] : (chunks[chunks.length - 1].push(el), chunks), [])
      for (const [key, value] of chunk<string>(httpCase.headers, 2)) {
        expect(resp.headers.get(key)).to.equal(value)
      }

      expect(await resp.text()).to.equal(httpCase.body ?? '')
    }
  })
})
