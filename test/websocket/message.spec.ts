import { expect } from 'aegir/chai'
import { Uint8ArrayList } from 'uint8arraylist'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { decodeMessage, encodeMessage } from '../../src/websocket/message.js'

describe('websocket messages', () => {
  it('should encode and decode a small message', () => {
    const data = Uint8Array.from([0, 1, 2, 3, 4])
    const input = encodeMessage('BINARY', data, true)

    const output = decodeMessage(new Uint8ArrayList(input.subarray()))
    expect(output).to.have.property('type', 'BINARY')
    expect(output).to.have.property('data').that.equalBytes(data)
  })

  it('should encode and decode a medium message', () => {
    const data = new Uint8Array(49_391).map((v, i) => i)
    const input = encodeMessage('BINARY', data, true)

    const output = decodeMessage(new Uint8ArrayList(input.subarray()))
    expect(output).to.have.property('type', 'BINARY')
    expect(output).to.have.property('data').that.equalBytes(data)
  })

  it('should encode and decode a large message', () => {
    const data = new Uint8Array(123_392_198).map((v, i) => i)
    const input = encodeMessage('BINARY', data, true)

    const output = decodeMessage(new Uint8ArrayList(input.subarray()))
    expect(output).to.have.property('type', 'BINARY')
    expect(output).to.have.property('data').that.equalBytes(data)
  })

  describe('rfc6455 examples', () => {
    it('A single-frame unmasked text message', () => {
      const input = Uint8Array.from([
        0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f
      ])
      const output = decodeMessage(new Uint8ArrayList(input))

      expect(output).to.have.property('type', 'TEXT')
      expect(output).to.have.property('data').that.equalBytes(uint8ArrayFromString('Hello'))
    })

    it('A single-frame masked text message', () => {
      const input = Uint8Array.from([
        0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58
      ])
      const output = decodeMessage(new Uint8ArrayList(input))

      expect(output).to.have.property('type', 'TEXT')
      expect(output).to.have.property('data').that.equalBytes(uint8ArrayFromString('Hello'))
    })

    it('A fragmented unmasked text message', () => {
      const input1 = Uint8Array.from([
        0x01, 0x03, 0x48, 0x65, 0x6c
      ])
      const output1 = decodeMessage(new Uint8ArrayList(input1))

      expect(output1).to.have.property('type', 'TEXT')
      expect(output1).to.have.property('data').that.equalBytes(uint8ArrayFromString('Hel'))

      const input2 = Uint8Array.from([
        0x80, 0x02, 0x6c, 0x6f
      ])
      const output2 = decodeMessage(new Uint8ArrayList(input2))

      expect(output2).to.have.property('type', 'CONTINUATION')
      expect(output2).to.have.property('data').that.equalBytes(uint8ArrayFromString('lo'))
    })

    it('Unmasked Ping request and masked Ping response', () => {
      const input1 = Uint8Array.from([
        0x89, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f
      ])
      const output1 = decodeMessage(new Uint8ArrayList(input1))

      expect(output1).to.have.property('type', 'PING')
      expect(output1).to.have.property('data').that.equalBytes(uint8ArrayFromString('Hello'))

      const input2 = Uint8Array.from([
        0x8a, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58
      ])
      const output2 = decodeMessage(new Uint8ArrayList(input2))

      expect(output2).to.have.property('type', 'PONG')
      expect(output2).to.have.property('data').that.equalBytes(uint8ArrayFromString('Hello'))
    })

    it('256 bytes binary message in a single unmasked frame', () => {
      const data = new Uint8Array(256).map(((v, i) => i))
      const input = Uint8Array.from([
        0x82, 0x7E, 0x01, 0x00
      ])
      const output = decodeMessage(new Uint8ArrayList(input, data))

      expect(output).to.have.property('type', 'BINARY')
      expect(output).to.have.property('data').that.equalBytes(data)
    })

    it.skip('64KiB binary message in a single unmasked frame', () => {
      const data = new Uint8Array(Math.pow(2, 16)).map(((v, i) => i))
      const input = Uint8Array.from([
        0x82, 0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00
      ])
      const output = decodeMessage(new Uint8ArrayList(input, data))

      expect(output).to.have.property('type', 'BINARY')
      expect(output).to.have.property('data').that.equalBytes(data)
    })
  })
})
