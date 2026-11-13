import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import { APP_CONFIG } from '../ports/app-config.port';

/**
 * Loads a translation file from `public/i18n` (docs/adr/0004-transloco-setup.md). Transloco passes `pt-BR` for the
 * root file and `<scope>/pt-BR` for a scope. The URL is relative, so it resolves under the base href (GitHub Pages
 * serves the app from `/setpoint-beach-tennis/`). The build id is added so a deploy never pairs new code with a
 * translation file the browser cached from the previous release.
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  getTranslation(path: string): Observable<Translation> {
    return this.http.get<Translation>(`i18n/${path}.json`, { params: { v: this.config.buildId } });
  }
}
