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
    .live-board{min-width:0;margin-top:12px;border-top:1px solid var(--border)}
    .live-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
    .live-head span{font-size:10px;font-weight:800;color:var(--muted)}
    .live-head strong{font-size:11px;color:var(--green-2)}
    .live-undo{width:38px;height:38px;flex:none;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:20px;cursor:pointer}
    .live-undo:disabled,.live-add:disabled{opacity:.4;cursor:not-allowed}
    .live-columns,.live-row{display:grid;grid-template-columns:minmax(0,1fr) 48px 56px 44px;align-items:center;gap:6px}
    .live-board.readonly .live-columns,.live-board.readonly .live-row{grid-template-columns:minmax(0,1fr) 48px 56px}
    .live-columns{padding:5px 0;color:var(--muted);font-size:9px;font-weight:800;text-align:center}
    .live-columns span:first-child{text-align:left}
    .live-row{min-height:64px;border-top:1px solid var(--border)}
    .live-team{display:grid;gap:5px;min-width:0;padding:7px 0}
    .live-player{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;font-weight:700}
    .live-player span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .live-value{text-align:center;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
    .live-points{color:var(--green-2)}
    .live-add{width:42px;height:42px;border:0;border-radius:6px;background:var(--green-2);color:#fff;font-size:24px;line-height:1;cursor:pointer}
    .live-error{margin:12px 0;color:var(--danger);font-size:12px}
    @media(max-width:420px){.live-columns,.live-row{grid-template-columns:minmax(0,1fr) 38px 46px 42px;gap:4px}.live-board.readonly .live-columns,.live-board.readonly .live-row{grid-template-columns:minmax(0,1fr) 38px 46px}.live-player{font-size:11px}.live-value{font-size:16px}}
  `],
  template: `
    <div class="live-board" [class.readonly]="!editable" *ngIf="score as current; else invalidScore">
      <div class="live-head"><span>PONTO A PONTO</span><strong>{{ current.winner ? 'SET ENCERRADO' : current.tieBreak ? 'TIE-BREAK' : 'EM ANDAMENTO' }}</strong><button *ngIf="editable" class="live-undo" type="button" (click)="undoSelected.emit()" [disabled]="!matchData.livePoints?.length" aria-label="Desfazer último ponto" title="Desfazer último ponto">↶</button></div>
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