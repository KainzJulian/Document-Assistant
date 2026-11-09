import { Injector, Provider, runInInjectionContext } from '@angular/core';

/**
 * Create a class that uses `inject()` in its fields, with fake dependencies (for unit tests).
 * @param type - The class to create (a store or service).
 * @param providers - Fake providers, for example `{ provide: ApiClient, useValue: fakeApi }`.
 * @returns The new instance.
 */
export function create<T>(type: new () => T, providers: Provider[]): T {
  return runInInjectionContext(Injector.create({ providers }), () => new type());
}
