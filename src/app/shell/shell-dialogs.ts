import { inject, Injectable, signal } from '@angular/core';
import { DialogService } from '../core/dialog.service';
import { CurrentTournament } from '../core/current-tournament';
import { Notices } from '../core/notices';
import { SetupTourCue } from '../features/setup/data/setup-tour-cue';
import { libraryId } from '../core/tournament-library';
import { ThemeService } from '../core/theme';
import type { ProfileDialogData, ProfileDialogResult } from '../features/profile/data/profile-panel.store';
import type { ProfileDialogComponent } from '../features/profile/profile-dialog.component';
import type { LibraryDialogData } from '../features/library/data/library.store';
import type { LibraryDialogComponent } from '../features/library/library-dialog.component';
import { ShellState } from './shell-state';
import { TournamentLifecycle } from './tournament-lifecycle';

/**
 * The two lazy dialogs the shell opens: the profile panel and "Meus torneios". The shell keeps the gating (when one may
 * open: the first-visit welcome, nothing stacking); this opens it, says whether it is open, and acts on its answer.
 */
@Injectable({ providedIn: 'root' })
export class ShellDialogs {
  private readonly dialog = inject(DialogService);
  private readonly tournament = inject(CurrentTournament);
  private readonly notices = inject(Notices);
  private readonly setupTourCue = inject(SetupTourCue);
  private readonly theme = inject(ThemeService);
  private readonly shellState = inject(ShellState);
  private readonly lifecycle = inject(TournamentLifecycle);
  private readonly profileIsOpen = signal(false);
  private libraryIsOpen = false;

  /** The profile dialog is open: setup tours and the saved-tournaments prompt wait for it to close. */
  readonly profileOpen = this.profileIsOpen.asReadonly();

  /**
   * The profile panel. `afterWelcome` is what waits for the first-visit panel to close (the setup tour, the saved
   * tournaments), so overlays never stack. From the panel the organizer can go on to "Meus torneios".
   */
  async openProfile(welcome = false, afterWelcome?: () => void): Promise<void> {
    if (this.profileIsOpen()) return;
    this.setupTourCue.take();
    this.profileIsOpen.set(true);
    let result: ProfileDialogResult | undefined;
    try {
      const {
        ProfileDialogComponent: component,
        PROFILE_TITLE_ID: labelledBy,
        PROFILE_WELCOME_TEXT_ID: welcomeTextId,
      } = await import('../features/profile/profile-dialog.component');
      result = await this.dialog.open<ProfileDialogResult, ProfileDialogData, ProfileDialogComponent>(component, {
        data: {
          welcome,
          currentLibraryId: libraryId(this.tournament.state()),
          shell: this.shellState.profile,
          setTheme: (mode) => this.theme.set(mode),
        },
        labelledBy,
        describedBy: welcome ? welcomeTextId : undefined,
        id: 'profilePanel',
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-light',
        anchor: { top: '72px', right: 'max(16px, calc((100vw - 1160px) / 2 + 28px))' },
        sheetBelow: 560,
      });
    } catch {
      // The panel is a lazy chunk: offline or after a deploy it may not load. Whatever waited for it still goes on.
      this.notices.showKey('profileFailed', 'error');
      if (welcome && afterWelcome) afterWelcome();
      return;
    } finally {
      this.profileIsOpen.set(false);
    }
    if (result?.kind === 'library') void this.openLibrary();
    else if (result?.kind === 'open') await this.lifecycle.openSaved(result.id);
    else if (result?.kind === 'import') void this.lifecycle.importBackup(result.file);
    else if (welcome && afterWelcome) window.setTimeout(afterWelcome, 250);
  }

  /** "Meus torneios". It opens a saved tournament through the lifecycle. */
  async openLibrary(): Promise<void> {
    if (this.libraryIsOpen) return;
    this.libraryIsOpen = true;
    try {
      const { LibraryDialogComponent: component, LIBRARY_TITLE_ID: labelledBy } =
        await import('../features/library/library-dialog.component');
      await this.dialog.open<void, LibraryDialogData, LibraryDialogComponent>(component, {
        data: { currentId: libraryId(this.tournament.state()), open: (id) => this.lifecycle.openSaved(id) },
        labelledBy,
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-plain',
        sheetBelow: 620,
      });
    } catch {
      this.notices.showKey('libraryFailed', 'error');
    } finally {
      this.libraryIsOpen = false;
    }
  }
}
