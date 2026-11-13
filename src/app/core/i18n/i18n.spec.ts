import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TRANSLOCO_CONFIG, type Translation, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import shell from '../../../../public/i18n/pt-BR.json';
import { translocoTesting } from '../../testing/transloco-testing';
import { APP_CONFIG } from '../ports/app-config.port';
import { testConfig } from '../ports/testing/app-config.fake';
import { provideI18n } from './provide-i18n';
import { HttpTranslationLoader } from './translation-loader';

describe('HttpTranslationLoader', () => {
  function setup(): { loader: HttpTranslationLoader; http: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: testConfig({ buildId: 'build-42' }) },
      ],
    });
    return { loader: TestBed.inject(HttpTranslationLoader), http: TestBed.inject(HttpTestingController) };
  }

  it('reads the root file with a relative URL, so it resolves under the base href', async () => {
    const { loader, http } = setup();
    const result = firstValueFrom(loader.getTranslation('pt-BR'));
    const request = http.expectOne((req) => req.url === 'i18n/pt-BR.json');
    expect(request.request.method).toBe('GET');
    request.flush(shell);
    expect(await result).toEqual(shell);
    http.verify();
  });

  it('reads a scope from its folder', async () => {
    const { loader, http } = setup();
    const result = firstValueFrom(loader.getTranslation('shared/pt-BR'));
    const scope: Translation = { header: { title: 'Título' } };
    http.expectOne((req) => req.url === 'i18n/shared/pt-BR.json').flush(scope);
    expect(await result).toEqual(scope);
  });

  it('adds the build id, so a deploy does not reuse a file cached from the previous release', () => {
    const { loader, http } = setup();
    void firstValueFrom(loader.getTranslation('pt-BR'));
    const request = http.expectOne((req) => req.url === 'i18n/pt-BR.json');
    expect(request.request.urlWithParams).toBe('i18n/pt-BR.json?v=build-42');
    request.flush(shell);
  });
});

describe('provideI18n', () => {
  function setup(): { transloco: TranslocoService; http: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [provideI18n(), provideHttpClientTesting(), { provide: APP_CONFIG, useValue: testConfig() }],
    });
    return { transloco: TestBed.inject(TranslocoService), http: TestBed.inject(HttpTestingController) };
  }

  it('uses pt-BR as the default and the fallback language', () => {
    setup();
    const config = TestBed.inject(TRANSLOCO_CONFIG);
    expect(config.defaultLang).toBe('pt-BR');
    expect(config.fallbackLang).toBe('pt-BR');
    expect(config.availableLangs).toEqual(['pt-BR']);
  });

  it('translates a shell key from the root file loaded over HTTP', async () => {
    const { transloco, http } = setup();
    const text = firstValueFrom(transloco.selectTranslate('shell.footer.feedback'));
    http.expectOne((req) => req.url === 'i18n/pt-BR.json').flush(shell);
    expect(await text).toBe('Feedback');
  });
});

describe('translocoTesting', () => {
  it('serves the real pt-BR text synchronously', () => {
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    expect(TestBed.inject(TranslocoService).translate('shell.footer.versionTitle')).toBe('Versão do aplicativo');
  });

  it('adds the scope files a spec passes', () => {
    const scope: Translation = { header: { title: 'Título' } };
    TestBed.configureTestingModule({ imports: [translocoTesting({ 'demo/pt-BR': scope })] });
    // Transloco keeps translations flattened.
    expect(TestBed.inject(TranslocoService).getTranslation('demo/pt-BR')).toEqual({ 'header.title': 'Título' });
  });
});
