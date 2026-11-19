import { lazy, type ComponentType } from 'react'

type Loader<P> = () => Promise<{ default: ComponentType<P> }>

export type PreloadableComponent<P> = ReturnType<typeof lazy<ComponentType<P>>> & { preload: Loader<P> }

/** React.lazy + a `.preload()` so links can warm the route chunk on hover/focus. */
export function lazyPage<P = object>(loader: Loader<P>): PreloadableComponent<P> {
  let promise: ReturnType<Loader<P>> | null = null
  const load: Loader<P> = () => {
    if (!promise) {
      promise = loader().catch((err) => {
        promise = null // allow retry after a failed chunk load
        throw err
      })
    }
    return promise
  }
  const Component = lazy(load) as PreloadableComponent<P>
  Component.preload = load
  return Component
}
