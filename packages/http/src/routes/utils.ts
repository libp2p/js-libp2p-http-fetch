import type { HTTPRoute, HandlerRoute, ServiceRoute } from '../index.ts'

/**
 * Returns true if the passed route requires initialization
 */
function isInitializable <H extends HandlerRoute<any>, S extends ServiceRoute<any>> (obj: H | S): obj is S {
  // @ts-expect-error init is not a property of H
  return typeof obj.init === 'function'
}

/**
 * Initializes a `ServiceRoute` and converts it to a `HandlerRoute`.
 *
 * If the passed route has an `init` method, it invokes it and sets the
 * `handler` field on the endpoint with the return value, then deletes the
 * `init` property, otherwise it returns the endpoint unaltered.
 */
export function initializeRoute <H> (serviceOrHandler: HTTPRoute<H>, components: any): HandlerRoute<H> {
  if (isInitializable(serviceOrHandler)) {
    const route: any = serviceOrHandler
    route.handler = serviceOrHandler.init(components)
    delete route.init

    return route
  }

  return serviceOrHandler
}
