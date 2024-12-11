/**
 * Returns nothing as browsers handle cookies for us
 */
export function getAgent (): any {
  return {
    agent: undefined,
    jar: {
      getCookies: () => []
    }
  }
}
