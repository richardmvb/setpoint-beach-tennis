import type { ModuleWithProviders } from '@angular/core';
import { type Translation, TranslocoTestingModule } from '@jsverse/transloco';
import shell from '../../../public/i18n/pt-BR.json';

/**
 * Transloco for specs, with the real pt-BR files loaded synchronously, so a spec asserts the text a person sees.
 * Pass a feature's scope files as `{ 'shared/pt-BR': sharedPtBr }` (imported from `public/i18n/<scope>/pt-BR.json`).
 */
export function translocoTesting(
  scopes: Record<string, Translation> = {},
): ModuleWithProviders<TranslocoTestingModule> {
  return TranslocoTestingModule.forRoot({
    langs: { 'pt-BR': shell, ...scopes },
    translocoConfig: { availableLangs: ['pt-BR'], defaultLang: 'pt-BR' },
    preloadLangs: true,
  });
}
