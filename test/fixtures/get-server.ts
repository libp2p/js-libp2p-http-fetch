import type { createServer } from 'node:http'

export function getServer (s: typeof createServer): ReturnType<typeof createServer> {
  return s((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (req.url === '/echo') {
      req.on('data', buf => {
        res.write(buf)
      })
      req.on('end', () => {
        res.end()
      })
      req.on('error', err => {
        res.destroy(err)
      })

      return
    }

    res.end('Hello World!')
  })
}
