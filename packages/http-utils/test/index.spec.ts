import { expect } from 'aegir/chai'
import { getHost } from '../src/index.ts'

describe('@libp2p/http-utils', () => {
  describe('getHost', () => {
    it('should omit default ports from URLs', () => {
      expect(getHost(new URL('http://example.com'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('http://example.com:80'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('https://example.com'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('https://example.com:443'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('ws://example.com'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('ws://example.com:80'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('wss://example.com'), new Headers())).to.equal('example.com')
      expect(getHost(new URL('wss://example.com:443'), new Headers())).to.equal('example.com')
    })

    it('should include non-default ports from URLs', () => {
      expect(getHost(new URL('http://example.com:8080'), new Headers())).to.equal('example.com:8080')
      expect(getHost(new URL('https://example.com:444'), new Headers())).to.equal('example.com:444')
      expect(getHost(new URL('ws://example.com:8080'), new Headers())).to.equal('example.com:8080')
      expect(getHost(new URL('wss://example.com:444'), new Headers())).to.equal('example.com:444')
    })
  })
})
