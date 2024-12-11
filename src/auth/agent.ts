import { CookieAgent } from 'http-cookie-agent/undici'
import { CookieJar } from 'tough-cookie'

/**
 * Returns an HTTP Agent that handles cookies over multiple requests
 */
export function getAgent (): { agent: CookieAgent, jar: CookieJar } {
  const jar = new CookieJar()

  return {
    agent: new CookieAgent({
      cookies: {
        jar
      }
    }),
    jar
  }
}
