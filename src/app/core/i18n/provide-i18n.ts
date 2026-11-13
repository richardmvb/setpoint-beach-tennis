import { provideHttpClient, withFetch } from '@angular/common/http';
import { type EnvironmentProviders, isDevMode } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { HttpTranslationLoader } from './translation-loader';

/** The only language until Phase 6 adds English (docs/adr/0004-transloco-setup.md). */
const DEFAULT_LANG = 'pt-BR';

/**
 * Translations with Transloco. pt-BR is both the default and the fallback language. The root file
 * (`public/i18n/pt-BR.json`) holds the app shell's strings; each feature provides its own scope with
 * `provideTranslocoScope`, so its file loads with the feature.
 */
export function provideI18n(): EnvironmentProviders[] {
  return [
    provideHttpClient(withFetch()),
    ...provideTransloco({
      config: {
        availableLangs: [DEFAULT_LANG],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
      },
      loader: HttpTranslationLoader,
    }),
  ];
}
