import { Uint8ArrayList } from 'uint8arraylist'

export type MESSAGE_TYPE = 'CONTINUATION' | 'TEXT' | 'BINARY' | 'CONNECTION_CLOSE' | 'PING' | 'PONG'

const OP_CODES: Record<MESSAGE_TYPE, number> = {
  CONTINUATION: 0,
  TEXT: 1,
  BINARY: 2,
  CONNECTION_CLOSE: 8,
  PING: 9,
  PONG: 10
}

const MESSAGE_TYPES: Record<number, MESSAGE_TYPE> = {
  0: 'CONTINUATION',
  1: 'TEXT',
  2: 'BINARY',
  8: 'CONNECTION_CLOSE',
  9: 'PING',
  10: 'PONG'
}

export const CLOSE_CODES = {
  1000: 'NORMAL_CLOSURE',
  1001: 'GOING_AWAY',
  1002: 'PROTOCOL_ERROR',
  1003: 'UNSUPPORTED_DATA',
  1004: 'RESERVED',
  1005: 'NO_STATUS_RECEIVED',
  1006: 'ABNORMAL_CLOSURE',
  1007: 'INVALID_FRAME_PAYLOAD_DATA',
  1008: 'POLICY_VIOLATION',
  1009: 'MESSAGE_TOO_BIG',
  1010: 'MANDATORY_EXT',
  1011: 'INTERNAL_SERVER_ERROR',
  1015: 'TLS_HANDSHAKE'
}

export const CLOSE_MESSAGES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  RESERVED: 1004,
  NO_STATUS_RECEIVED: 1005,
  ABNORMAL_CLOSURE: 1006,
  INVALID_FRAME_PAYLOAD_DATA: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  MANDATORY_EXT: 1010,
  INTERNAL_SERVER_ERROR: 1011,
  TLS_HANDSHAKE: 1015
}

interface Message {
  type: MESSAGE_TYPE
  data?: Uint8Array
}

// 0               1               2               3
// 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7
// +-+-+-+-+------+-+-------------+-------------------------------+
// |F|R|R|R|opcode|M| Payload len |    Extended payload length    |
// |I|S|S|S| (4)  |A|     (7)     |             (16/64)           |
// |N|V|V|V|      |S|             |   (if payload len==126/127)   |
// | |1|2|3|      |K|             |                               |
// +-+-+-+-+------+-+-------------+ - - - - - - - - - - - - - - - +
// |    Extended payload length continued, if payload len == 127  |
// + - - - - - - - - - - - - - - -+-------------------------------+
// |                              |Masking-key, if MASK set to 1  |
// +------------------------------+-------------------------------+
// | Masking-key (continued)      |          Payload Data         |
// +------------------------------- - - - - - - - - - - - - - - - +
// :                    Payload Data continued ...                :
// +- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
// |                    Payload Data continued ...                |
// +--------------------------------------------------------------+

export function decodeMessage (buf: Uint8ArrayList): Message | undefined {
  let offset = 0

  if (buf.byteLength < (offset + 1)) {
    return
  }

  const byte0 = buf.get(offset)
  const opcode = (byte0 & 0b00001111)
  offset++

  if (MESSAGE_TYPES[opcode] == null) {
    throw new Error(`Unknown opcode: ${opcode}`)
  }

  if (buf.byteLength < (offset + 1)) {
    return
  }

  const byte1 = buf.get(offset)
  const isMasked = (byte1 & 0b10000000) === 0b10000000
  let length = (byte1 & 0b01111111)
  offset++

  if (length === 126) {
    if (buf.byteLength < (offset + 2)) {
      return
    }

    length = buf.getUint16(offset)
    offset += 2
  } else if (length === 127) {
    if (buf.byteLength < (offset + 8)) {
      return
    }

    length = buf.getUint32(offset)
    offset += 8
  }

  if (length === 0) {
    buf.consume(offset)

    return {
      type: MESSAGE_TYPES[opcode]
    }
  }

  let mask: Uint8Array | undefined

  if (isMasked) {
    // check if we have the whole mask
    if (buf.byteLength < (offset + 4)) {
      return
    }

    mask = buf.subarray(offset, offset + 4)
    offset += 4
  }

  // check if we have all the data
  if (buf.byteLength < (offset + length)) {
    return
  }

  let data = buf.subarray(offset, offset + length)
  offset += length

  if (mask != null) {
    data = applyMask(data, mask)
  }

  buf.consume(offset)

  return {
    type: MESSAGE_TYPES[opcode],
    data
  }
}

function applyMask (data: Uint8Array, mask: Uint8Array): Uint8Array {
  let m = 0

  for (let i = 0; i < data.byteLength; i++) {
    data[i] = data[i] ^ mask[m]

    m++
    if (m === mask.byteLength) {
      m = 0
    }
  }

  return data
}

export async function * decodeMessages (source: AsyncGenerator<Uint8Array | Uint8ArrayList>): AsyncGenerator<Message> {
  const buffer = new Uint8ArrayList()

  for await (const buf of source) {
    buffer.append(buf)

    const message = decodeMessage(buffer)

    if (message != null) {
      yield message
    }
  }
}

export function encodeMessage (opcode: MESSAGE_TYPE, data?: Uint8Array, maskData?: boolean): Uint8ArrayList {
  const fin = true
  const message = new Uint8ArrayList(
    Uint8Array.from([
      (fin ? 128 : 0) | OP_CODES[opcode]
    ])
  )

  const length = data?.byteLength ?? 0

  if (length < 126) {
    message.append(
      Uint8Array.from([
        length | (maskData === true ? 128 : 0)
      ])
    )
  } else if (length < 65_535) {
    const l = new Uint8ArrayList(
      new Uint8Array(3)
    )
    l.set(0, 126 | (maskData === true ? 128 : 0))
    l.setUint16(1, length)

    message.append(l)
  } else if (length < 18_446_744_073_709_552_000) {
    const l = new Uint8ArrayList(
      new Uint8Array(9)
    )
    l.set(0, 127 | (maskData === true ? 128 : 0))
    l.setUint32(1, length)

    message.append(l)
  } else {
    throw new Error('Payload too largs')
  }

  if (maskData === true && data != null) {
    const maskingKey = Uint8Array.from([0, 0, 0, 0])
    message.append(maskingKey)

    data = applyMask(data, maskingKey)
  }

  if (data != null) {
    message.append(data)
  }

  return message
}
