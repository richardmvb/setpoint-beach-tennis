import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { interval, Subject } from 'rxjs';
import { CurrentTournament } from '../../../core/current-tournament';
import {
  calculateFinalLiveScore,
  type FinalLivePoint,
  finalLiveMatchScore,
  MAX_FINAL_LIVE_POINTS,
} from '../../../core/final-live-score';
import { FinalsService, type PodiumPlace } from '../../../core/finals.service';
import type { Match, Page } from '../../../core/models';
import { NpsFeedbackService } from '../../../core/nps-feedback.service';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { CLOCK } from '../../../core/ports/clock.port';
import { RANDOM } from '../../../core/ports/random.port';
import { SelectedRound } from '../../../core/selected-round';
import { ShareCardService } from '../../../core/share-card.service';
import { DialogService } from '../../../core/dialog.service';
import { canGenerateFinals, earlyFinalsReady, withFinishedAt } from '../../../domain/tournament-play/finals';
import {
  finalScoreStatus,
  isValidRoundScore,
  type FinalScoreStatus,
  type RoundScoreStatus,
  roundScoreStatus,
  type ScoreDraft,
} from '../../../domain/tournament-play/score-entry';
import {
  type LiveScoreRule,
  type PodiumRule,
  withFinalLiveMode,
  withFinalLivePoints,
  withFinalScore,
  withoutScore,
  withRoundScore,
} from '../../../domain/tournament-play/scores';
import { unresolvedFinalTie } from '../../../domain/tournament-play/tie-draw';
import * as tournamentFormat from '../../../domain/tournament-view/format';
import { groupTables } from '../../../domain/tournament-view/group-tables';
import * as tournamentProgress from '../../../domain/tournament-view/progress';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import type { FinalWinnerSide } from '../../../domain/tournament-view/scoring';
import type {
  PlayerMatchesDialogComponent,
  PlayerMatchesDialogData,
} from '../player-matches-dialog/player-matches-dialog.component';
import type {
  ShareResultsDialogComponent,
  ShareResultsDialogData,
} from '../share-results-dialog/share-results-dialog.component';
import { ShareResultsSession } from '../share-results-dialog/share-results-session';
import type { TieDrawDialogComponent } from '../tie-draw-dialog/tie-draw-dialog.component';

/** What a tournament page asks of the shell, which owns navigation: the page cannot do it itself. */
export type ShellRequest = { kind: 'navigate'; page: Page } | { kind: 'finalized' };

/** What was typed in a match's score fields and is not on the match yet, with the scores it was typed over. */
interface Draft extends ScoreDraft {
  baseA: number | null;
  baseB: number | null;
  /** The tournament it was typed in: another tournament can have a match with the same id. */
  tournament: string;
}

function podiumKey(places: PodiumPlace[]): string {
  return places.map((place) => `${place.place}:${place.playerIds.join('+')}`).join('|');
}

/**
 * The organizer's tournament views: Partidas and Ranking (with the finals, the podium and the tie draw). Provided by
 * `TournamentComponent`, so it lives while any of those pages is on screen; what must outlive it is in root services:
 * the tournament (`CurrentTournament`), the selected round (`SelectedRound`), the share pick (`ShareResultsSession`).
 * Every action replaces the tournament through a function of `domain/tournament-play` and asks the shell to save it
 * (`CurrentTournament.save`); nothing here edits the tournament in place.
 */
@Injectable()
export class TournamentStore {
  private readonly tournament = inject(CurrentTournament);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly selected = inject(SelectedRound);
  private readonly finals = inject(FinalsService);
  private readonly analytics = inject(ANALYTICS);
  private readonly dialog = inject(DialogService);
  private readonly clock = inject(CLOCK);
  private readonly random = inject(RANDOM);
  private readonly nps = inject(NpsFeedbackService);
  private readonly shareCard = inject(ShareCardService);
  private readonly shareSession = inject(ShareResultsSession);
  private readonly transloco = inject(TranslocoService);
  private readonly standingsMemo = createStandingsMemo();

  readonly state = this.tournament.state;
  readonly selectedRound = this.selected.index;
  readonly maxLivePoints = MAX_FINAL_LIVE_POINTS;
  /** The shell listens to these (`TournamentComponent` forwards them as its output). */
  readonly requests = new Subject<ShellRequest>();

  /** Decides the winner of a final (the domain gets this rule instead of importing the score engine). */
  readonly winnerSide: FinalWinnerSide = (match) => this.finals.winnerSide(match);
  private readonly podiumRule: PodiumRule = (stage) => this.finals.updatePodium(stage);
  private readonly liveRule: LiveScoreRule = (points) => finalLiveMatchScore(calculateFinalLiveScore(points));

  private tieDrawOpening = false;
  private readonly now = signal(this.clock.now());
  private readonly tournamentKey = computed(() => {
    const state = this.state();
    return `${state.createdAt}|${state.analyticsId ?? ''}|${state.sharedTournamentId ?? ''}`;
  });
  private readonly drafts = signal<Record<string, Draft>>({});

  readonly isShared = computed(() => this.state().hostingMode === 'shared');
  readonly isGroup = computed(() => tournamentFormat.isGroupTournament(this.state()));
  readonly hasSchedule = computed(() => this.state().rounds.length > 0);
  readonly canEditScores = computed(
    () => !this.isShared() || (this.owned.moderator() && this.state().sharedStatus === 'active'),
  );
  readonly roundsLocked = computed(() => !!this.state().finals);
  readonly finalsLocked = computed(() => !!this.state().finishedAt);
  readonly canEditRoundScores = computed(() => this.canEditScores() && !this.roundsLocked());
  readonly canEditFinalScores = computed(() => this.canEditScores() && !this.finalsLocked());
  readonly canFinalizeTournament = computed(
    () => this.canEditScores() && !!this.state().finals?.complete && !this.state().finishedAt,
  );

  private readonly standingsView = computed(() => this.standingsMemo(this.state()));
  readonly standings = computed(() => this.standingsView().all);
  readonly maleStandings = computed(() => this.standingsView().male);
  readonly femaleStandings = computed(() => this.standingsView().female);
  readonly groupTables = computed(() => groupTables(this.state(), this.standings()));
  readonly fixedPairsMode = computed(() => tournamentFormat.fixedPairsMode(this.state()));
  readonly usesMixedFinals = computed(() => tournamentFormat.usesMixedFinals(this.state()));
  readonly usesMixedFinalBracket = computed(() => tournamentFormat.usesMixedFinalBracket(this.state()));
  readonly mixedFinalistCount = computed(() => tournamentFormat.mixedFinalistCount(this.state()));
  readonly earlyFinalsReady = computed(() => earlyFinalsReady(this.state(), this.standings()));
  readonly canGenerateFinal = computed(() => canGenerateFinals(this.state(), this.standings(), this.canEditScores()));

  readonly currentRound = computed(() => this.state().rounds[this.selectedRound()] ?? null);
  readonly completedRounds = computed(() => tournamentProgress.completedRounds(this.state()));
  readonly elapsedLabel = computed(() => tournamentProgress.elapsedLabel(this.state(), this.now()));

  /** Keeps its identity while the podium is unchanged, so the clock tick does not re-render and re-animate it. */
  readonly finalPodium = computed<PodiumPlace[]>(
    () => {
      const finals = this.state().finals;
      return finals?.complete ? this.finals.podium(finals) : [];
    },
    { equal: (a, b) => podiumKey(a) === podiumKey(b) },
  );

  readonly sharePlayerId = this.shareSession.playerId;
  readonly shareMessage = this.shareSession.message;
  readonly shareCandidates = computed(() => {
    const state = this.state();
    const standings = this.standings();
    return state.players
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        place: this.shareCard.placementOf(state, standings, player.id),
      }))
      .sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
  });

  constructor() {
    // The elapsed time of the tournament ticks once a second while it runs.
    interval(1000)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        const state = this.state();
        if (state.startedAt && !state.finishedAt) this.now.set(this.clock.now());
      });
  }

  request(request: ShellRequest): void {
    this.requests.next(request);
  }

  playerName(id: string): string {
    return (
      this.state().players.find((player) => player.id === id)?.name ??
      this.transloco.translate('removedPlayer', {}, 'organizer/pt-BR')
    );
  }

  playerPhoto(id: string): string {
    return this.state().players.find((player) => player.id === id)?.photoDataUrl ?? '';
  }

  groupName(groupId: string): string {
    return this.state().groups?.find((group) => group.id === groupId)?.name ?? groupId;
  }

  roundDone(index: number): boolean {
    return tournamentProgress.roundDone(this.state(), index);
  }

  roundMatchesDone(index: number): number {
    return tournamentProgress.roundMatchesDone(this.state(), index);
  }

  isScored(match: Match): boolean {
    return match.scoreA !== null && match.scoreB !== null;
  }

  selectRound(index: number): void {
    this.selected.select(index, this.state().rounds.length);
  }

  /** What the match's score fields show: what was typed over the match's current score, or the score itself. */
  draftOf(match: Match): ScoreDraft {
    const draft = this.drafts()[match.id];
    return draft &&
      draft.tournament === this.tournamentKey() &&
      draft.baseA === match.scoreA &&
      draft.baseB === match.scoreB
      ? draft
      : { a: match.scoreA, b: match.scoreB };
  }

  scoreStatus(match: Match): RoundScoreStatus {
    return roundScoreStatus(this.draftOf(match), match, this.state().gamesToWin);
  }

  finalStatus(match: Match): FinalScoreStatus {
    return finalScoreStatus(match, this.winnerSide);
  }

  scoreChanged(match: Match, side: 'a' | 'b', value: number | null): void {
    if (!this.canEditRoundScores()) return;
    const next = { ...this.draftOf(match), [side]: value };
    if (!isValidRoundScore(next.a, next.b, this.state().gamesToWin)) {
      this.drafts.update((drafts) => ({
        ...drafts,
        [match.id]: { ...next, baseA: match.scoreA, baseB: match.scoreB, tournament: this.tournamentKey() },
      }));
      return;
    }
    this.dropDraft(match.id);
    if (match.scoreA === next.a && match.scoreB === next.b) return;
    this.tournament.update((state) => withRoundScore(state, match.id, next.a as number, next.b as number));
    this.tournament.save();
    const state = this.state();
    this.analytics.capture('match_score_recorded', {
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      round_number: this.selectedRound() + 1,
      match_phase: match.phase ?? (this.isGroup() ? 'groups' : 'super'),
    });
  }

  async clearScore(match: Match): Promise<void> {
    if (match.phase === 'final' ? !this.canEditFinalScores() : !this.canEditRoundScores()) return;
    const confirmed = await this.dialog.confirm({
      title: this.transloco.translate('confirm.clearScore.title', {}, 'organizer/pt-BR'),
      text: this.transloco.translate('confirm.clearScore.text', {}, 'organizer/pt-BR'),
      confirmText: this.transloco.translate('confirm.clearScore.confirm', {}, 'organizer/pt-BR'),
      tone: 'danger',
    });
    if (!confirmed) return;
    this.dropDraft(match.id);
    this.tournament.update((state) => withoutScore(state, match.id, this.podiumRule));
    this.tournament.save(this.transloco.translate('notices.scoreRemoved', {}, 'organizer/pt-BR'));
  }

  finalScoreChanged(match: Match, field: 'a' | 'b' | 'tieBreakA' | 'tieBreakB', value: number | null): void {
    if (!this.canEditFinalScores() || match.livePoints !== undefined || !match.teamA[0] || !match.teamB[0]) return;
    const edit = {
      a: match.scoreA,
      b: match.scoreB,
      tieBreakA: match.tieBreakA ?? null,
      tieBreakB: match.tieBreakB ?? null,
      [field]: value,
    };
    const hadWinner = this.winnerSide(match) !== null;
    this.tournament.update((state) => withFinalScore(state, match.id, edit, this.podiumRule));
    this.tournament.save();
    this.recordFinalScore(match.id, hadWinner);
  }

  async toggleFinalLiveScore(match: Match): Promise<void> {
    if (!this.canEditFinalScores() || match.finalKind !== 'championship' || !match.teamA[0] || !match.teamB[0]) return;
    const active = match.livePoints !== undefined;
    const hasResult = active ? !!match.livePoints?.length : match.scoreA !== null || match.scoreB !== null;
    if (
      hasResult &&
      !(await this.dialog.confirm({
        title: this.transloco.translate('confirm.liveMode.title', {}, 'organizer/pt-BR'),
        text: this.transloco.translate('confirm.liveMode.text', {}, 'organizer/pt-BR'),
        confirmText: this.transloco.translate('confirm.liveMode.confirm', {}, 'organizer/pt-BR'),
        tone: 'danger',
      }))
    )
      return;
    this.tournament.update((state) => withFinalLiveMode(state, match.id, !active, this.liveRule, this.podiumRule));
    this.tournament.save();
  }

  addFinalLivePoint(match: Match, point: FinalLivePoint): void {
    if (
      !this.canEditFinalScores() ||
      match.finalKind !== 'championship' ||
      !match.teamA[0] ||
      !match.teamB[0] ||
      !match.livePoints ||
      match.livePoints.length >= MAX_FINAL_LIVE_POINTS
    )
      return;
    if (calculateFinalLiveScore(match.livePoints).winner) return;
    this.updateLivePoints(match, [...match.livePoints, point]);
  }

  undoFinalLivePoint(match: Match): void {
    if (!this.canEditFinalScores() || match.finalKind !== 'championship' || !match.livePoints?.length) return;
    this.updateLivePoints(match, match.livePoints.slice(0, -1));
  }

  /** "Gerar finais": the finals, or the tie draw first when the ranking has a tie it cannot split. */
  async generateFinal(): Promise<void> {
    if (!this.canGenerateFinal()) {
      this.tournament.notify(this.transloco.translate('notices.finishPhase', {}, 'organizer/pt-BR'), 'error');
      return;
    }
    if (unresolvedFinalTie(this.state(), this.standingsView()).length) {
      // A second tap while the first is still loading the dialog must not open another one.
      if (this.tieDrawOpening) return;
      this.tieDrawOpening = true;
      try {
        const { TieDrawDialogComponent: component, TIE_DRAW_TITLE_ID: labelledBy } =
          await import('../tie-draw-dialog/tie-draw-dialog.component');
        const confirmed = await this.dialog.open<boolean, undefined, TieDrawDialogComponent>(component, {
          data: undefined,
          labelledBy,
          autoFocus: 'dialog',
          backdropClass: 'ui-backdrop-plain',
          sheetBelow: 520,
        });
        if (!confirmed) return;
      } catch {
        // The dialog is a lazy chunk: offline or after a deploy it may not load.
        this.tournament.notify(this.transloco.translate('notices.tieDrawFailed', {}, 'organizer/pt-BR'), 'error');
        return;
      } finally {
        this.tieDrawOpening = false;
      }
    }
    this.createFinals();
  }

  /** The shell shows the report and the analytics around this: it returns true once the tournament is finished. */
  async finalizeTournament(): Promise<boolean> {
    if (!this.canFinalizeTournament()) return false;
    const state = this.state();
    const confirmed = await this.dialog.confirmTyped({
      title: this.transloco.translate('confirm.finalize.title', {}, 'organizer/pt-BR'),
      text: this.transloco.translate('confirm.finalize.text', {}, 'organizer/pt-BR'),
      phrase: this.transloco.translate('confirm.finalize.phrase', {}, 'organizer/pt-BR'),
      confirmText: this.transloco.translate('confirm.finalize.confirm', {}, 'organizer/pt-BR'),
      tone: 'primary',
    });
    if (!confirmed) {
      this.analytics.capture('tournament_finalize_cancelled', {
        tournament_mode: state.tournamentMode,
        hosting_mode: state.hostingMode,
      });
      return false;
    }
    if (!this.canFinalizeTournament()) return false;
    const finishedAt = this.clock.iso();
    this.tournament.update((current) => withFinishedAt(current, finishedAt));
    this.tournament.save(this.transloco.translate('notices.finalized', {}, 'organizer/pt-BR'));
    return true;
  }

  /** The analytics and the survey that follow the shell's own steps once the tournament is finished. */
  finalized(): void {
    const state = this.state();
    const finishedAt = state.finishedAt;
    this.analytics.capture('tournament_finalized', {
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      hosting_mode: state.hostingMode,
      tournament_size: state.size,
      participant_count: state.players.length,
      duration_seconds:
        state.startedAt && finishedAt
          ? Math.round((Date.parse(finishedAt) - Date.parse(state.startedAt)) / 1000)
          : undefined,
    });
    this.analytics.logInfo('tournament finalized', {
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      hosting_mode: state.hostingMode,
      tournament_size: state.size,
      participant_count: state.players.length,
      has_started_at: !!state.startedAt,
    });
    void this.nps.open(true);
  }

  /** The dialogs are lazy chunks: they load on the first click, not with the app. */
  async openPlayerMatches(playerId: string): Promise<void> {
    const { PlayerMatchesDialogComponent: component, PLAYER_MATCHES_TITLE_ID: labelledBy } =
      await import('../player-matches-dialog/player-matches-dialog.component');
    await this.dialog.open<void, PlayerMatchesDialogData, PlayerMatchesDialogComponent>(component, {
      data: { state: this.state(), playerId },
      labelledBy,
      sheetBelow: 620,
    });
  }

  async shareResults(): Promise<void> {
    const playerId = this.sharePlayerId();
    if (!this.state().finals?.complete || !playerId) return;
    const { ShareResultsDialogComponent: component, SHARE_RESULTS_TITLE_ID: labelledBy } =
      await import('../share-results-dialog/share-results-dialog.component');
    await this.dialog.open<void, ShareResultsDialogData, ShareResultsDialogComponent>(component, {
      data: { state: this.state(), standings: this.standings(), playerId },
      labelledBy,
      sheetBelow: 600,
    });
  }

  selectSharePlayer(playerId: string): void {
    this.shareSession.playerId.set(playerId);
  }

  private createFinals(): void {
    if (!this.canGenerateFinal()) return;
    const state = this.state();
    try {
      const male = this.maleStandings();
      const female = this.femaleStandings();
      const stage = this.usesMixedFinalBracket()
        ? this.finals.createMixedBracket(male, female)
        : this.usesMixedFinals()
          ? this.finals.createMixedDirect(male, female)
          : this.finals.create(this.standings());
      this.drafts.set({});
      this.tournament.update((current) => ({ ...current, finals: stage }));
      this.tournament.save(
        this.usesMixedFinalBracket()
          ? this.transloco.translate('notices.finalsMixedBracket', {}, 'organizer/pt-BR')
          : this.usesMixedFinals()
            ? this.transloco.translate('notices.finalsMixedDirect', {}, 'organizer/pt-BR')
            : this.transloco.translate('notices.finalsStandard', {}, 'organizer/pt-BR'),
      );
      this.analytics.capture('finals_generated', {
        tournament_mode: state.tournamentMode,
        doubles_format: state.doublesFormat ?? 'open',
        tournament_size: state.size,
      });
    } catch (error) {
      this.tournament.notify(
        error instanceof Error
          ? error.message
          : this.transloco.translate('notices.finalsFailed', {}, 'organizer/pt-BR'),
        'error',
      );
    }
  }

  private updateLivePoints(match: Match, points: FinalLivePoint[]): void {
    const hadWinner = this.winnerSide(match) !== null;
    this.tournament.update((state) => withFinalLivePoints(state, match.id, points, this.liveRule, this.podiumRule));
    this.tournament.save();
    this.recordFinalScore(match.id, hadWinner);
  }

  /** The first time a final gets a winner, analytics hears about it. */
  private recordFinalScore(matchId: string, hadWinner: boolean): void {
    const match = this.state().finals?.matches.find((candidate) => candidate.id === matchId);
    if (hadWinner || !match || this.winnerSide(match) === null) return;
    const state = this.state();
    this.analytics.capture('final_score_recorded', {
      final_kind: match.finalKind,
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
    });
  }

  private dropDraft(matchId: string): void {
    if (!(matchId in this.drafts())) return;
    this.drafts.update(({ [matchId]: _dropped, ...rest }) => rest);
  }
}
