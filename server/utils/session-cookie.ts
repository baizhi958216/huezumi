export const SESSION_COOKIE_NAME = 'huezumi_session'

/** HTTP and WebSocket authentication must use the same cookie name. */
export function sessionTokenFromCookies(readCookie: (name: string) => string | undefined) {
  return readCookie(SESSION_COOKIE_NAME) || undefined
}

export function sessionTokenFromHeader(header: string | null) {
  const cookies = new Map((header || '').split(';').map((part) => {
    const separator = part.indexOf('=')
    return [part.slice(0, separator).trim(), separator < 0 ? '' : part.slice(separator + 1)]
  }))
  return sessionTokenFromCookies((name) => {
    const value = cookies.get(name)
    if (!value)
      return undefined
    try {
      return decodeURIComponent(value)
    }
    catch {
      return undefined
    }
  })
}
