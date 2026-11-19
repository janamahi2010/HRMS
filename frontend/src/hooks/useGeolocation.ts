import { useEffect, useState } from 'react'

export interface GeoFix {
  lat: number
  lng: number
  accuracy: number
}

export type GeoErrorKind = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'

export class GeoError extends Error {
  constructor(public kind: GeoErrorKind) {
    super(kind)
  }
}

interface FixOptions {
  /** Resolve as soon as a fix is at least this accurate (metres). */
  goodEnough?: number
  /** Give up after this long and return the best fix seen (if any). */
  maxWaitMs?: number
  onProgress?: (accuracy: number) => void
  signal?: AbortSignal
}

/**
 * Watch the position briefly and return the most accurate fix.
 * Phones often report a coarse (wifi/cell) fix first and refine within seconds,
 * so taking the first reading would cause needless "too imprecise" rejections.
 */
export function getBestFix({ goodEnough = 35, maxWaitMs = 12_000, onProgress, signal }: FixOptions = {}): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new GeoError('insecure'))
    if (!('geolocation' in navigator)) return reject(new GeoError('unsupported'))

    let best: GeoFix | null = null
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
    signal?.addEventListener('abort', onAbort)

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        if (!best || fix.accuracy < best.accuracy) best = fix
        onProgress?.(best.accuracy)
        if (best.accuracy <= goodEnough) finish(() => resolve(best!))
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return finish(() => reject(new GeoError('denied')))
        if (best) return finish(() => resolve(best!))
        if (err.code === err.TIMEOUT) return finish(() => reject(new GeoError('timeout')))
        finish(() => reject(new GeoError('unavailable')))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    )
    const timer = setTimeout(
      () => finish(() => (best ? resolve(best) : reject(new GeoError('timeout')))),
      maxWaitMs,
    )
  })
}

export type GeoPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

/** Live browser permission state (where the Permissions API exists; Safari < 16 reports 'unknown'). */
export function useGeoPermission(): GeoPermission {
  const [state, setState] = useState<GeoPermission>('unknown')
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => status && setState(status.state as GeoPermission)
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        status = s
        update()
        s.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])
  return state
}
