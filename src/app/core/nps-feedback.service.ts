import { inject, Injectable, signal } from '@angular/core';
import { ANALYTICS, SURVEYS } from './ports/analytics.port';

/** The NPS survey in the analytics service (its name there). */
const NPS_SURVEY_NAME = 'Net promoter score (NPS) (2026-11-01 20:44)';

/** Why the survey did not open (the footer shows `shell.footer.surveyUnavailable` or `surveyFailed`). */
export type NpsFeedbackMessage = '' | 'unavailable' | 'failed';

/**
 * Opens the NPS survey: from the footer button, and on its own when a tournament the person follows ends.
 * The footer shows `loading` and `message`, so both callers share them.
 */
@Injectable({ providedIn: 'root' })
export class NpsFeedbackService {
  private readonly surveys = inject(SURVEYS);
  private readonly analytics = inject(ANALYTICS);

  readonly loading = signal(false);
  readonly message = signal<NpsFeedbackMessage>('');

  /** True when the survey can be shown at all (the footer hides the button otherwise). */
  get available(): boolean {
    return this.surveys.available;
  }

  async open(centered = false): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set('');
    try {
      const opened = await this.surveys.showByName(NPS_SURVEY_NAME, centered);
      if (!opened) {
        this.message.set('unavailable');
        return;
      }
      this.analytics.capture('nps_feedback_opened', { survey: 'nps' });
    } catch {
      this.message.set('failed');
    } finally {
      this.loading.set(false);
    }
  }
}
