import { readHeaders, responseToStream, streamToRequest } from '@libp2p/http-utils'
import { streamPair } from '@libp2p/utils'
import { expect } from 'aegir/chai'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { fetch } from '../src/index.ts'
import { cases } from './fixtures/cases.ts'
import type { Stream } from '@libp2p/interface'

function serve (server: Stream, handler: (req: Request) => Response | Promise<Response>): void {
  void Promise.resolve().then(async () => {
    const info = await readHeaders(server)
    const res = await handler(streamToRequest(info, server))
    await responseToStream(res, server)
  })
}

function echo (server: any): void {
  serve(server, (req) => {
    return new Response(req.body, {
      headers: req.headers
    })
  })
}

describe('@libp2p/http-fetch', () => {
  it('should make a simple GET request', async () => {
    const [outboundStream, inboundStream] = await streamPair()

    serve(inboundStream, (req) => {
      return new Response('Hello World')
    })

    const res = await fetch(outboundStream, 'https://example.com')

    expect(await res.text()).to.equal('Hello World')
  })

  it('should GET with headers', async () => {
    const [outboundStream, inboundStream] = await streamPair()

    echo(inboundStream)

    const res = await fetch(outboundStream, 'https://example.com', {
      headers: {
        'X-Test': 'foo'
      }
    })

    expect(res.headers.get('X-Test')).to.equal('foo')
  })

  it('should POST some data', async () => {
    const [outboundStream, inboundStream] = await streamPair()

    echo(inboundStream)

    const res = await fetch(outboundStream, 'https://example.com', {
      method: 'POST',
      body: 'Hello World'
    })

    expect(await res.text()).to.equal('Hello World')
  })

  it('should handle trash', async () => {
    const [outboundStream, inboundStream] = await streamPair()

    inboundStream.send(uint8ArrayFromString('FOOOOOOOOOOOOOOOOo'))
    void inboundStream.close()

    await expect(fetch(outboundStream, 'https://example.com')).to.eventually.be.rejected()
      .with.property('name', 'InvalidResponseError')
  })

  it('should handle messages that arrive in a trickle', async () => {
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

      const [outboundStream, inboundStream] = await streamPair()

      const rawHttp = new TextEncoder().encode(httpCase.raw)
      // Trickle the response 1 byte at a time
      for (let i = 0; i < rawHttp.length; i++) {
        inboundStream.send(rawHttp.subarray(i, i + 1))
      }
      void inboundStream.close()

      // Request doesn't matter
      const resp = await fetch(outboundStream, 'https://example.com')

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

      const [outboundStream, inboundStream] = await streamPair()

      inboundStream.send(uint8ArrayFromString(httpCase.raw))
      void inboundStream.close()

      // Request doesn't matter
      const resp = await fetch(outboundStream, 'https://example.com')

      expect(resp.status).to.equal(expectedStatusCode)
      const chunk = <T>(arr: T[], size: number): T[][] => arr.reduce<T[][]>((chunks, el, i) => i % size === 0 ? [...chunks, [el]] : (chunks[chunks.length - 1].push(el), chunks), [])
      for (const [key, value] of chunk<string>(httpCase.headers, 2)) {
        expect(resp.headers.get(key)).to.equal(value)
      }

      expect(await resp.text()).to.equal(httpCase.body ?? '')
    }
  })
})
