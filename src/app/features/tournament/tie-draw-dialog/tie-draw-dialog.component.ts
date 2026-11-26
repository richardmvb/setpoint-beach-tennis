import { DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CurrentTournament } from '../../../core/current-tournament';
import { prefersReducedMotion } from '../../../core/motion';
import { TournamentPersistence } from '../../../core/tournament-persistence';
import { CLOCK } from '../../../core/ports/clock.port';
import { RANDOM } from '../../../core/ports/random.port';
import { nextOpenTie, shuffledOrder, withTieDraw } from '../../../domain/tournament-play/tie-draw';
import { fixedPairsMode, usesGroupQualification } from '../../../domain/tournament-view/format';
import { describeQualificationTie } from '../../../domain/tournament-view/group-qualification';
import { rankedPairGroups } from '../../../domain/tournament-view/pair-standings';
import { createStandingsMemo, type OpenTie } from '../../../domain/tournament-view/standings';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { shuffleFrames } from './shuffle-frames';

/** Id of the dialog's title, which names it (aria-labelledby). */
export const TIE_DRAW_TITLE_ID = 'tieDrawTitle';

/**
 * How long each step of the shuffle takes, in milliseconds: fast at first, then slowing down until the list settles
 * on the drawn order (about two and a half seconds in all).
 */
export const SHUFFLE_STEPS_MS = [120, 130, 150, 180, 220, 270, 340, 430, 560] as const;
/** The pause on the settled order before the places and the cut line show. */
export const SHUFFLE_SETTLE_MS = 350;

type Phase = 'ready' | 'shuffling' | 'done';

/**
 * The draw that breaks a tie the ranking rules cannot split, asked for when the finals are generated. It walks the
 * ties one at a time: draw, then confirm (which moves to the next tie, or finishes). The draw is made and stored in
 * the tournament as soon as it is asked for, so cancelling keeps the draws that were made; the list then shuffles
 * and settles on the drawn order (at once when the person asked for less motion). Only the places that still count
 * get an order: when the tie crosses the cut, the others are shown as out, together. It closes with `true` once no
 * tie is left and the finals can be generated, and with anything else when cancelled. Open it with
 * `DialogService.open`.
 */
@Component({
  selector: 'app-tie-draw-dialog',
  imports: [TranslocoDirective, ButtonComponent, PlayerAvatarComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tie-draw-modal' },
  templateUrl: './tie-draw-dialog.component.html',
  styleUrl: './tie-draw-dialog.component.css',
})
export class TieDrawDialogComponent {
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly tournament = inject(CurrentTournament);
  private readonly persistence = inject(TournamentPersistence);
  private readonly random = inject(RANDOM);
  private readonly clock = inject(CLOCK);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly standingsMemo = createStandingsMemo();
  private readonly standings = computed(() => this.standingsMemo(this.tournament.state()));
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  protected readonly titleId = TIE_DRAW_TITLE_ID;
  protected readonly state = this.tournament.state;
  /** The tie this step draws for. */
  protected readonly tie = signal<OpenTie | null>(this.nextTie());
  protected readonly playerIds = computed(() => this.tie()?.players.map((row) => row.playerId) ?? []);
  protected readonly phase = signal<Phase>('ready');
  /** The order on screen: the tied athletes, then each step of the shuffle, then the drawn order. */
  protected readonly shown = signal<string[]>(this.playerIds());
  /** The places that still count; the tie crosses the cut when there are fewer of them than tied athletes. */
  protected readonly spots = computed(() => this.tie()?.spots ?? 0);
  protected readonly crossesCut = computed(() => this.spots() < this.playerIds().length);
  protected readonly firstPlace = computed(() => this.tie()?.firstPlace ?? 1);
  protected readonly lastPlace = computed(() => this.firstPlace() + this.playerIds().length - 1);
  /** Once drawn: the athletes who keep a place, in order. */
  protected readonly placed = computed(() => (this.phase() === 'done' ? this.shown().slice(0, this.spots()) : []));
  /** Once drawn: the athletes left out, in name order (the draw gives them no order that counts). */
  protected readonly left = computed(() =>
    this.phase() === 'done'
      ? this.shown()
          .slice(this.spots())
          .sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b)))
      : [],
  );
  /** Another tie waits after the one on screen. */
  protected readonly moreTies = computed(() => nextOpenTie(this.state(), this.standings()) !== null);
  /** Fixed pairs: the draw is between pairs, each stood for by its first partner (`PairStanding.pairId`). */
  protected readonly pairs = computed(() => fixedPairsMode(this.state()));
  private readonly pairRanking = computed(() => rankedPairGroups(this.state()).flat());
  /** In the 20-player format the tie is in a group, among the third places, or in the order of the qualifiers. */
  protected readonly qualificationTie = computed(() => {
    const state = this.state();
    const tie = this.tie();
    return usesGroupQualification(state) && tie ? describeQualificationTie(state, tie.players) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  /** The athletes behind a drawn id: both partners of a pair, or the athlete. */
  protected membersOf(id: string): string[] {
    return this.pairs() ? (this.pairRanking().find((pair) => pair.pairId === id)?.playerIds ?? [id]) : [id];
  }

  protected nameOf(id: string): string {
    return this.membersOf(id)
      .map((member) => this.state().players.find((player) => player.id === member)?.name ?? '')
      .join(' + ');
  }

  protected photoOf(id: string): string {
    return this.state().players.find((player) => player.id === id)?.photoDataUrl ?? '';
  }

  protected draw(): void {
    const ids = this.playerIds();
    if (ids.length < 2 || this.phase() !== 'ready') return;
    const order = shuffledOrder(ids, (max) => this.random.int(max));
    this.tournament.update((state) => withTieDraw(state, ids, order, this.clock.iso()));
    this.persistence.save(this.transloco.translate('notices.tieDrawn', {}, 'organizer/pt-BR'));
    if (prefersReducedMotion()) {
      this.shown.set(order);
      this.phase.set('done');
      return;
    }
    this.phase.set('shuffling');
    this.play(shuffleFrames(order, SHUFFLE_STEPS_MS.length), 0);
  }

  protected confirm(): void {
    if (this.phase() !== 'done') return;
    const next = this.nextTie();
    if (next) {
      this.tie.set(next);
      this.shown.set(next.players.map((row) => row.playerId));
      this.phase.set('ready');
      return;
    }
    this.ref.close(true);
  }

  protected cancel(): void {
    this.ref.close(false);
  }

  /** Shows one frame, slides every row from where it was to where it is now, and schedules the next frame. */
  private play(frames: string[][], index: number): void {
    const duration = SHUFFLE_STEPS_MS[index];
    const before = this.rowTops();
    this.shown.set(frames[index]);
    afterNextRender(() => this.slideFrom(before, duration), { injector: this.injector });
    const last = index === frames.length - 1;
    this.later(
      () => (last ? this.phase.set('done') : this.play(frames, index + 1)),
      duration + (last ? SHUFFLE_SETTLE_MS : 0),
    );
  }

  private rowTops(): Map<string, number> {
    const rows = this.list()?.nativeElement.querySelectorAll<HTMLElement>('li[data-id]') ?? [];
    return new Map([...rows].map((row) => [row.dataset['id']!, row.getBoundingClientRect().top] as const));
  }

  /** FLIP: each row starts where it was and slides to its new place. */
  private slideFrom(before: Map<string, number>, duration: number): void {
    for (const [id, top] of this.rowTops()) {
      const shift = (before.get(id) ?? top) - top;
      const row = this.list()?.nativeElement.querySelector<HTMLElement>(`li[data-id="${id}"]`);
      if (!shift || typeof row?.animate !== 'function') continue;
      row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }], {
        duration,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      });
    }
  }

  private later(run: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }

  private nextTie(): OpenTie | null {
    return nextOpenTie(this.tournament.state(), this.standings());
  }
}
