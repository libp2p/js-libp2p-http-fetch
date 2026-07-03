import { expect } from 'aegir/chai'
import { Cookies } from '../src/middleware/cookies.ts'

describe('@libp2p/http - node', () => {
  it('strips set-cookie from responses with immutable headers', async () => {
    const cookies = new Cookies({
      logger: {
        forComponent: () => () => {}
      }
    } as any)

    const response = new Response('ok', {
      headers: {
        'content-type': 'text/plain',
        'set-cookie': 'sid=abc; Max-Age=3600',
        'set-cookie2': 'legacy=def; Max-Age=3600'
      }
    })
    const immutableHeaders = new Proxy(response.headers, {
      get (target, prop) {
        if (prop === 'delete') {
          return () => { throw new TypeError('immutable') }
        }

        const value = target[prop as keyof Headers]

        if (typeof value === 'function') {
          return value.bind(target)
        }

        return value
      }
    })

    Object.defineProperty(response, 'headers', {
      value: immutableHeaders
    })

    const headers = new Headers({ origin: 'https://example.com' })
    const output = await cookies.processResponse(new URL('https://example.com'), {
      headers
    } as any, response)

    expect(output).to.not.equal(response)
    expect(output?.headers.get('set-cookie')).to.equal(null)
    expect(output?.headers.get('set-cookie2')).to.equal(null)
    expect(output?.headers.get('content-type')).to.equal('text/plain')
    await expect(output?.text()).to.eventually.equal('ok')

    await cookies.prepareRequest(new URL('https://example.com'), {
      headers
    } as any)

    expect(headers.get('cookie')).to.equal('sid=abc')
  })
})
