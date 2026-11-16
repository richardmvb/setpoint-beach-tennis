import { inject, Injectable } from '@angular/core';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { APP_CONFIG, versionLabel } from '../../../core/ports/app-config.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { markLandingSeen } from './landing-visit';

/**
 * The landing page's state and actions. Provided by `LandingComponent`, so it lives and dies with the page.
 * Leaving the landing is remembered on the device, so the next visit opens the app.
 */
@Injectable()
export class LandingStore {
  private readonly local = inject(LOCAL_STORE);
  private readonly analytics = inject(ANALYTICS);
  readonly versionLabel = versionLabel(inject(APP_CONFIG));

  /** "Criar meu torneio" / "Abrir o app". */
  start(): void {
    markLandingSeen(this.local);
    this.analytics.capture('landing_cta_clicked');
  }

  /** "Retomar um torneio" / "Meus torneios": the organizer goes to the saved tournaments. */
  resume(): void {
    markLandingSeen(this.local);
    this.analytics.capture('landing_library_clicked');
  }
}
