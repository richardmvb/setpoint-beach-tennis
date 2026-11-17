import { computed, DestroyRef, inject, type Provider } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrentTournament } from '../core/current-tournament';
import { AppNavigation } from '../core/routing/app-navigation';
import { createStandingsMemo } from '../domain/tournament-view/standings';
import { ProjectionController } from '../features/tournament/projection/projection-controller';
import { ProjectionTarget } from '../features/tournament/projection/projection-target';

/**
 * The host's `ProjectionController` (the guest's is built by the shared view). It reads the tournament in use, its
 * standings, the athlete the host picked (the leader until then) and whether Projeção is the page on screen, and
 * leaves the projection when the page changes. Provided by the shell, because its nav entry reads it too.
 */
export function provideHostProjection(): Provider {
  return {
    provide: ProjectionController,
    useFactory: () => {
      const tournament = inject(CurrentTournament);
      const navigation = inject(AppNavigation);
      const target = inject(ProjectionTarget);
      const memo = createStandingsMemo();
      const standings = computed(() => memo(tournament.state()).all);
      const controller = new ProjectionController();
      controller.connect({
        state: () => tournament.state(),
        standings,
        playerId: () => target.playerId() || standings()[0]?.playerId || '',
        isGuest: false,
        viewing: () => navigation.page() === 'projection',
      });
      navigation.left$
        .pipe(takeUntilDestroyed(inject(DestroyRef)))
        .subscribe((page) => page === 'projection' && controller.leave());
      return controller;
    },
  };
}
