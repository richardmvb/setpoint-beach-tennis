import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { routes } from './app.routes';
import { RouterUrlState } from './router-url-state';
import { URL_STATE } from './url-state';

/**
 * The router and its UrlState. Loaded with a dynamic import only when the `routerEnabled` flag is on, so the
 * router is not in the bundle that everyone downloads until it is switched on.
 */
export function provideRouterUrlState(): ApplicationConfig['providers'] {
  return [
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    RouterUrlState,
    { provide: URL_STATE, useExisting: RouterUrlState },
  ];
}
