import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { providePostHogErrorHandler } from './app/core/posthog-error-handler';

bootstrapApplication(AppComponent, {
  providers: [providePostHogErrorHandler()],
}).catch((error: unknown) => console.error('Falha ao iniciar SETPOINT', error));
