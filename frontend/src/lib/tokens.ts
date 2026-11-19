/**
 * Token storage.
 * - Access token: memory only (short-lived, never persisted).
 * - Refresh token: localStorage. Frontend and API live on different onrender.com
 *   subdomains (a public suffix), so cross-site httpOnly cookies are not reliable.
 *   Refresh tokens rotate and are blacklisted after use, limiting replay.
 */

const REFRESH_KEY = 'hrms-refresh'

let accessToken: string | null = null

export const tokenStore = {
  getAccess: () => accessToken,
  setAccess: (t: string | null) => {
    accessToken = t
  },
  getRefresh: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_KEY)
    } catch {
      return null
    }
  },
  setRefresh: (t: string | null) => {
    try {
      if (t) localStorage.setItem(REFRESH_KEY, t)
      else localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* storage unavailable (private mode): session-only login */
    }
  },
  set(access: string, refresh: string) {
    this.setAccess(access)
    this.setRefresh(refresh)
  },
  clear() {
    accessToken = null
    this.setRefresh(null)
  },
  REFRESH_KEY,
}
