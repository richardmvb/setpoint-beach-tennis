import { Injectable } from '@angular/core';
import { Match, PlayerStanding, TournamentState } from './models';

type PlayerMatchResult = {
  label: string;
  description: string;
  score: string;
  won: boolean | null;
};

@Injectable({ providedIn: 'root' })
export class ShareCardService {
  async sharePlayerResults(
    state: TournamentState,
    standings: PlayerStanding[],
    playerId: string
  ): Promise<'shared' | 'downloaded'> {
    const standing = standings.find(row => row.playerId === playerId);
    const player = state.players.find(item => item.id === playerId);
    if (!standing || !player || !state.finals?.complete) {
      throw new Error('O pódio precisa estar completo para compartilhar os resultados.');
    }

    const results = this.playerResults(state, playerId);
    const canvas = document.createElement('canvas');
    const width = 1080;
    const headerHeight = 430;
    const rowHeight = 104;
    const height = Math.max(1400, headerHeight + results.length * rowHeight + 170);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível gerar a imagem dos resultados.');

    context.fillStyle = '#f2f5f2';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#163f35';
    context.fillRect(0, 0, width, 18);
    context.fillStyle = '#e87938';
    context.fillRect(80, 88, 52, 5);
    context.textBaseline = 'top';
    context.fillStyle = '#163f35';
    context.font = '800 30px Manrope, sans-serif';
    context.fillText('SETPOINT', 80, 120);
    context.fillStyle = '#77827c';
    context.font = '600 16px "DM Sans", sans-serif';
    context.fillText(state.name.toLocaleUpperCase(), 80, 174, 900);
    context.fillStyle = '#18231f';
    context.font = '800 54px Manrope, sans-serif';
    context.fillText(player.name, 80, 220, 920);
    context.fillStyle = '#e87938';
    context.font = '800 28px Manrope, sans-serif';
    context.fillText(`${this.ordinal(standings.findIndex(row => row.playerId === playerId) + 1)} LUGAR`, 80, 300);
    context.fillStyle = '#77827c';
    context.font = '600 18px "DM Sans", sans-serif';
    context.fillText(`${standing.setsWon} vitórias · ${standing.matchesPlayed} jogos · saldo ${standing.gameBalance > 0 ? '+' : ''}${standing.gameBalance}`, 80, 356, 920);

    let y = headerHeight;
    for (const result of results) {
      context.fillStyle = '#ffffff';
      context.fillRect(80, y, 920, rowHeight - 12);
      context.fillStyle = result.won === null ? '#77827c' : result.won ? '#245c4c' : '#b8463b';
      context.fillRect(80, y, 7, rowHeight - 12);
      context.fillStyle = '#77827c';
      context.font = '700 14px "DM Sans", sans-serif';
      context.fillText(result.label.toLocaleUpperCase(), 108, y + 15, 850);
      context.fillStyle = '#18231f';
      context.font = '700 20px Manrope, sans-serif';
      context.fillText(result.description, 108, y + 40, 710);
      context.textAlign = 'right';
      context.fillText(result.score, 970, y + 38, 140);
      context.textAlign = 'left';
      y += rowHeight;
    }

    context.fillStyle = '#77827c';
    context.font = '600 15px "DM Sans", sans-serif';
    context.fillText('BEACH TENNIS · RESULTADO OFICIAL DO TORNEIO', 80, height - 90, 920);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Não foi possível preparar a imagem.')),
      'image/png'
    ));
    const file = new File([blob], `setpoint-${this.fileName(player.name)}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `${player.name} · ${state.name}`, files: [file] });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }

  private playerResults(state: TournamentState, playerId: string): PlayerMatchResult[] {
    const results: PlayerMatchResult[] = [];
    const addMatch = (match: Match, label: string): void => {
      const onA = match.teamA.includes(playerId);
      const onB = match.teamB.includes(playerId);
      if (!onA && !onB) return;
      const ownScore = onA ? match.scoreA : match.scoreB;
      const otherScore = onA ? match.scoreB : match.scoreA;
      const teammate = onA ? match.teamA.find(id => id !== playerId) : match.teamB.find(id => id !== playerId);
      const opponents = onA ? match.teamB : match.teamA;
      const score = ownScore === null || otherScore === null ? '—' : `${ownScore} × ${otherScore}`;
      const tieBreak = match.tieBreakA !== null && match.tieBreakA !== undefined
        && match.tieBreakB !== null && match.tieBreakB !== undefined
        ? ` (${onA ? match.tieBreakA : match.tieBreakB}–${onA ? match.tieBreakB : match.tieBreakA})` : '';
      const won = ownScore === null || otherScore === null ? null : ownScore > otherScore;
      results.push({
        label,
        description: `Dupla com ${this.playerName(state, teammate)} · contra ${opponents.map(id => this.playerName(state, id)).join(' + ')}`,
        score: `${score}${tieBreak}${won === null ? '' : won ? ' · V' : ' · D'}`,
        won
      });
    };

    for (const round of state.rounds) {
      for (const match of round.matches) addMatch(match, `Rodada ${round.number}${match.groupId ? ` · ${this.groupName(state, match.groupId)}` : ''}`);
    }
    for (const match of state.finals?.matches ?? []) {
      addMatch(match, match.finalKind === 'championship' ? 'Final' : 'Disputa de terceiro lugar');
    }
    return results;
  }

  private playerName(state: TournamentState, playerId?: string): string {
    return state.players.find(player => player.id === playerId)?.name ?? '—';
  }

  private groupName(state: TournamentState, groupId: string): string {
    return state.groups?.find(group => group.id === groupId)?.name ?? groupId;
  }

  private ordinal(position: number): string { return `${position}º`; }
  private fileName(name: string): string {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  }
}