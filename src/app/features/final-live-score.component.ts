import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Match, Player } from '../core/models';
import { calculateFinalLiveScore, FinalLivePoint, FinalLiveScore, MAX_FINAL_LIVE_POINTS } from '../core/final-live-score';
import { PlayerAvatarComponent } from './player-avatar.component';

@Component({
  selector: 'app-final-live-score',
  standalone: true,
  imports: [CommonModule, PlayerAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host{display:block;min-width:0}
    .live-board{min-width:0;margin-top:12px;padding:14px 14px 8px;border-radius:20px;background:radial-gradient(420px 160px at 90% -20%,rgba(232,121,56,.35),transparent 70%),linear-gradient(160deg,#0c241e,#17433a);color:#fff;box-shadow:0 18px 40px rgba(10,30,24,.28)}
    .live-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
    .live-head span{font-size:10px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.7)}
    .live-head strong{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;background:rgba(255,255,255,.12);font-size:10px;letter-spacing:.1em;color:#fff}
    .live-head strong.on{background:rgba(232,121,56,.9)}
    .live-dot{width:6px;height:6px;border-radius:50%;background:#fff;animation:live-blink 1.4s ease-in-out infinite}
    @keyframes live-blink{50%{opacity:.25}}
    .live-undo{width:38px;height:38px;flex:none;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:20px;cursor:pointer}
    .live-undo:disabled,.live-add:disabled{opacity:.4;cursor:not-allowed}
    .live-columns,.live-row{display:grid;grid-template-columns:minmax(0,1fr) 54px 64px 44px;align-items:center;gap:6px}
    .live-board.readonly .live-columns,.live-board.readonly .live-row{grid-template-columns:minmax(0,1fr) 54px 64px}
    .live-columns{padding:5px 0;color:rgba(255,255,255,.55);font-size:9px;font-weight:800;letter-spacing:.1em;text-align:center}
    .live-columns span:first-child{text-align:left}
    .live-row{min-height:68px;border-top:1px solid rgba(255,255,255,.12)}
    .live-team{display:grid;gap:5px;min-width:0;padding:8px 0}
    .live-player{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;font-weight:700}
    .live-player span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .live-value{text-align:center;font:800 28px/1 var(--font-display,inherit);font-variant-numeric:tabular-nums}
    .live-points{display:grid;place-items:center;height:44px;border-radius:12px;background:rgba(255,255,255,.12);color:#ffd9bd;font-size:22px}
    .live-add{width:42px;height:42px;border:0;border-radius:12px;background:linear-gradient(135deg,#f19a62,#e87938);color:#fff;font-size:24px;line-height:1;cursor:pointer;box-shadow:0 6px 16px rgba(232,121,56,.4)}
    .live-error{margin:12px 0;color:var(--danger);font-size:12px}
    @media(max-width:420px){.live-columns,.live-row{grid-template-columns:minmax(0,1fr) 42px 52px 42px;gap:4px}.live-board.readonly .live-columns,.live-board.readonly .live-row{grid-template-columns:minmax(0,1fr) 42px 52px}.live-player{font-size:11px}.live-value{font-size:22px}.live-points{font-size:18px}}
    @media(prefers-reduced-motion:reduce){.live-dot{animation:none}}
  `],
  template: `
    <div class="live-board" [class.readonly]="!editable" *ngIf="score as current; else invalidScore">
      <div class="live-head"><span>PONTO A PONTO</span><strong [class.on]="!current.winner"><i *ngIf="!current.winner" class="live-dot"></i>{{ current.winner ? 'SET ENCERRADO' : current.tieBreak ? 'TIE-BREAK' : 'EM ANDAMENTO' }}</strong><button *ngIf="editable" class="live-undo" type="button" (click)="undoSelected.emit()" [disabled]="!matchData.livePoints?.length" aria-label="Desfazer último ponto" title="Desfazer último ponto">↶</button></div>
      <div class="live-columns"><span>DUPLA</span><span>GAMES</span><span>PONTOS</span><span *ngIf="editable"></span></div>
      <div class="live-row" *ngFor="let side of sides">
        <div class="live-team"><div class="live-player" *ngFor="let playerId of side === 'A' ? matchData.teamA : matchData.teamB"><app-player-avatar [name]="nameOf(playerId)" [photoDataUrl]="photoOf(playerId)" variant="team-avatar"></app-player-avatar><span>{{ nameOf(playerId) }}</span></div></div>
        <strong class="live-value">{{ side === 'A' ? current.gamesA : current.gamesB }}</strong>
        <strong class="live-value live-points" aria-live="polite" [attr.aria-label]="(side === 'A' ? 'Pontos da dupla 1: ' : 'Pontos da dupla 2: ') + pointLabel(current, side)">{{ pointLabel(current, side) }}</strong>
        <button *ngIf="editable" class="live-add" type="button" (click)="pointSelected.emit(side)" [disabled]="!!current.winner || (matchData.livePoints?.length ?? 0) >= maxPoints" [attr.aria-label]="side === 'A' ? 'Adicionar ponto à dupla 1' : 'Adicionar ponto à dupla 2'" [title]="side === 'A' ? 'Ponto para dupla 1' : 'Ponto para dupla 2'">+</button>
      </div>
    </div>
    <ng-template #invalidScore><p class="live-error" role="alert">Não foi possível exibir os pontos desta final.</p></ng-template>
  `
})
export class FinalLiveScoreComponent {
  @Input() players: Player[] = [];
  @Input() editable = false;
  @Output() pointSelected = new EventEmitter<FinalLivePoint>();
  @Output() undoSelected = new EventEmitter<void>();
  readonly sides: FinalLivePoint[] = ['A', 'B'];
  readonly maxPoints = MAX_FINAL_LIVE_POINTS;
  matchData!: Match;
  score: FinalLiveScore | null = null;

  @Input() set match(value: Match) {
    this.matchData = value;
    try { this.score = value.livePoints ? calculateFinalLiveScore(value.livePoints) : null; }
    catch { this.score = null; }
  }

  nameOf(playerId: string): string { return this.players.find(player => player.id === playerId)?.name ?? 'A definir'; }
  photoOf(playerId: string): string | undefined { return this.players.find(player => player.id === playerId)?.photoDataUrl; }
  pointLabel(score: FinalLiveScore, side: FinalLivePoint): string {
    if (score.tieBreak) return String(side === 'A' ? score.tieBreakA : score.tieBreakB);
    if (score.winner) return '—';
    return side === 'A' ? score.pointsA : score.pointsB;
  }
}