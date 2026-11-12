import { Injectable } from '@angular/core';
import { FinalsService, PodiumPlace } from './finals.service';
import { Match, PlayerStanding, TournamentState } from './models';

type PlayerMatchResult = {
  label: string;
  description: string;
  score: string;
  won: boolean | null;
};

export type ShareCardLayout = 'podium' | 'editorial' | 'scoreboard';

export interface ShareCardOptions {
  layout: ShareCardLayout;
  backgroundImageUrl?: string;
}

export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

@Injectable({ providedIn: 'root' })
export class ShareCardService {
  constructor(private finals: FinalsService) {}

  // Finalistas usam o pódio (2 atletas por colocação); os demais, a posição no ranking.
  placementOf(state: TournamentState, standings: PlayerStanding[], playerId: string): number {
    const podiumIndex = state.finals?.complete ? state.finals.podiumPlayerIds.indexOf(playerId) : -1;
    return podiumIndex >= 0
      ? Math.floor(podiumIndex / 2) + 1
      : standings.findIndex((row) => row.playerId === playerId) + 1;
  }

  async generatePlayerResultsImage(
    state: TournamentState,
    standings: PlayerStanding[],
    playerId: string,
    options: ShareCardOptions,
  ): Promise<Blob> {
    const standing = standings.find((row) => row.playerId === playerId);
    const player = state.players.find((item) => item.id === playerId);
    if (!standing || !player || !state.finals?.complete) {
      throw new Error('O pódio precisa estar completo para compartilhar os resultados.');
    }

    const results = this.playerResults(state, playerId);
    const podium = this.finals.podium(state.finals);
    const fourth = podium.find((place) => place.place === 4);
    const width = 1080;
    const layout = options.layout;
    const podiumTop = layout === 'editorial' ? 400 : layout === 'scoreboard' ? 470 : 430;
    const baseY = layout === 'editorial' ? 570 : podiumTop + 90 + 210;
    const fourthHeight = fourth ? 100 : 0;
    const resultsLabelY = baseY + 40 + fourthHeight + 30;
    const rowsTop = resultsLabelY + 56;
    const rowHeight = 108;
    const height = rowsTop + results.length * rowHeight + 150;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível gerar a imagem dos resultados.');

    const gold = '#e6c36a';
    if (options.backgroundImageUrl) {
      const image = await this.loadImage(options.backgroundImageUrl);
      const scale = Math.max(width / image.width, height / image.height);
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
      context.fillStyle = 'rgba(3, 12, 9, 0.62)';
      context.fillRect(0, 0, width, height);
    } else {
      const background = context.createLinearGradient(0, 0, width * 0.6, height);
      background.addColorStop(0, '#0a1f19');
      background.addColorStop(0.5, '#123b30');
      background.addColorStop(1, '#07140f');
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    const glow = context.createRadialGradient(width - 120, 140, 10, width - 120, 140, 620);
    glow.addColorStop(0, 'rgba(230,195,106,0.30)');
    glow.addColorStop(1, 'rgba(230,195,106,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    const glowBottom = context.createRadialGradient(80, height - 200, 10, 80, height - 200, 560);
    glowBottom.addColorStop(0, 'rgba(46,160,120,0.22)');
    glowBottom.addColorStop(1, 'rgba(46,160,120,0)');
    context.fillStyle = glowBottom;
    context.fillRect(0, 0, width, height);

    const duration =
      state.startedAt && state.finishedAt
        ? `  ·  ${formatElapsed(Date.parse(state.finishedAt) - Date.parse(state.startedAt))}`
        : '';
    const place = this.placementOf(state, standings, playerId);
    context.textBaseline = 'top';
    context.fillStyle = gold;
    context.font = '800 28px Manrope, sans-serif';
    if (layout === 'editorial') {
      context.textAlign = 'center';
      context.fillText('SETPOINT', width / 2, 84);
      context.fillStyle = 'rgba(255,255,255,0.65)';
      context.font = '600 17px "DM Sans", sans-serif';
      context.fillText(`${state.name.toLocaleUpperCase()}${duration}`, width / 2, 128, 920);
      context.fillStyle = '#ffffff';
      context.font = '800 68px Manrope, sans-serif';
      context.fillText(player.name, width / 2, 176, 920);
      context.fillStyle = gold;
      context.font = '800 34px Manrope, sans-serif';
      context.fillText(`${this.medal(place)} ${this.ordinal(place)} LUGAR`.trim(), width / 2, 274);
      context.fillStyle = 'rgba(255,255,255,0.65)';
      context.font = '600 18px "DM Sans", sans-serif';
      context.fillText(
        `${standing.setsWon} vitórias · ${standing.matchesPlayed} jogos · saldo ${standing.gameBalance > 0 ? '+' : ''}${standing.gameBalance}`,
        width / 2,
        330,
        920,
      );
      this.drawEditorialPodium(context, state, podium, playerId, podiumTop, gold);
      context.textAlign = 'left';
    } else if (layout === 'scoreboard') {
      context.fillText('SETPOINT', 80, 84);
      context.fillStyle = 'rgba(255,255,255,0.62)';
      context.font = '600 17px "DM Sans", sans-serif';
      context.fillText(`${state.name.toLocaleUpperCase()}${duration}`, 80, 128, 920);
      context.fillStyle = '#ffffff';
      context.font = '800 56px Manrope, sans-serif';
      context.fillText(player.name, 80, 176, 920);
      this.drawStatStrip(context, standing, place, gold, 252);
      context.fillStyle = gold;
      context.font = '800 15px "DM Sans", sans-serif';
      context.fillText('PÓDIO FINAL', 80, podiumTop - 8);
      this.drawPodium(context, state, podium, playerId, podiumTop, baseY, gold);
    } else {
      context.fillRect(80, 84, 56, 4);
      context.font = '800 28px Manrope, sans-serif';
      context.fillText('SETPOINT', 80, 106);
      context.fillStyle = 'rgba(255,255,255,0.62)';
      context.font = '600 17px "DM Sans", sans-serif';
      context.fillText(`${state.name.toLocaleUpperCase()}${duration}`, 80, 148, 920);
      context.fillStyle = '#ffffff';
      context.font = '800 60px Manrope, sans-serif';
      context.fillText(player.name, 80, 196, 920);
      context.fillStyle = gold;
      context.font = '800 30px Manrope, sans-serif';
      context.fillText(`${this.medal(place)} ${this.ordinal(place)} LUGAR`.trim(), 80, 282);
      context.fillStyle = 'rgba(255,255,255,0.62)';
      context.font = '600 19px "DM Sans", sans-serif';
      context.fillText(
        `${standing.setsWon} vitórias · ${standing.matchesPlayed} jogos · saldo ${standing.gameBalance > 0 ? '+' : ''}${standing.gameBalance}`,
        80,
        332,
        920,
      );
      context.fillStyle = gold;
      context.font = '800 15px "DM Sans", sans-serif';
      context.fillText('PÓDIO', 80, podiumTop - 8);
      this.drawPodium(context, state, podium, playerId, podiumTop, baseY, gold);
    }
    if (fourth) {
      const y = baseY + 40;
      this.roundRect(context, 80, y, 920, 76, 18);
      context.fillStyle = 'rgba(255,255,255,0.06)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.18)';
      context.setLineDash([8, 8]);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = 'rgba(255,255,255,0.6)';
      context.font = '800 24px Manrope, sans-serif';
      context.fillText('4º', 108, y + 24);
      const mine = fourth.playerIds.includes(playerId);
      context.fillStyle = mine ? gold : '#ffffff';
      context.font = `${mine ? 800 : 700} 24px Manrope, sans-serif`;
      context.fillText(fourth.playerIds.map((id) => this.playerName(state, id)).join(' + '), 176, y + 24, 790);
    }

    context.fillStyle = gold;
    context.font = '800 15px "DM Sans", sans-serif';
    context.fillText('SEUS JOGOS', 80, resultsLabelY);
    let y = rowsTop;
    for (const result of results) {
      this.roundRect(context, 80, y, 920, rowHeight - 14, 18);
      context.fillStyle = 'rgba(255,255,255,0.07)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.10)';
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = result.won === null ? '#8fa59b' : result.won ? '#4fd1a1' : '#ff8a7a';
      this.roundRect(context, 80, y + 16, 6, rowHeight - 46, 3);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.55)';
      context.font = '700 14px "DM Sans", sans-serif';
      context.fillText(result.label.toLocaleUpperCase(), 112, y + 17, 840);
      context.fillStyle = '#ffffff';
      context.font = '700 20px Manrope, sans-serif';
      context.fillText(result.description, 112, y + 44, 640);
      context.textAlign = 'right';
      context.fillStyle = result.won === null ? '#ffffff' : result.won ? '#4fd1a1' : '#ff8a7a';
      context.fillText(result.score, 968, y + 40, 260);
      context.textAlign = 'left';
      y += rowHeight;
    }

    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.font = '600 15px "DM Sans", sans-serif';
    context.fillText('BEACH TENNIS · RESULTADO OFICIAL DO TORNEIO', 80, height - 90, 920);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Não foi possível preparar a imagem.'))),
        'image/png',
      ),
    );
    return blob;
  }

  async shareImage(blob: Blob, playerName: string, tournamentName: string): Promise<boolean> {
    const file = new File([blob], this.fileName(playerName), { type: 'image/png' });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ title: `${playerName} · ${tournamentName}`, files: [file] });
    return true;
  }

  downloadImage(blob: Blob, playerName: string): void {
    const fileName = this.fileName(playerName);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Same medal-card look as the in-app podium: tinted card, medal on the top edge, avatars, names, place label. */
  private placePalette(place: number): { top: string; border: string } {
    return place === 1
      ? { top: 'rgba(249,231,174,0.30)', border: '#d9a93a' }
      : place === 2
        ? { top: 'rgba(226,232,238,0.22)', border: '#aab3bc' }
        : place === 3
          ? { top: 'rgba(241,211,180,0.22)', border: '#bf7f46' }
          : { top: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.22)' };
  }

  private initialsOf(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toLocaleUpperCase();
  }

  private drawAvatar(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, name: string): void {
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = '#e9ad7e';
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = '#0d2a22';
    context.stroke();
    context.fillStyle = '#34251c';
    context.textAlign = 'center';
    context.font = `800 ${Math.round(radius * 0.7)}px Manrope, sans-serif`;
    context.textBaseline = 'middle';
    context.fillText(this.initialsOf(name), cx, cy + 1);
    context.textBaseline = 'top';
  }

  private drawPodium(
    context: CanvasRenderingContext2D,
    state: TournamentState,
    podium: PodiumPlace[],
    playerId: string,
    top: number,
    baseY: number,
    gold: string,
  ): void {
    const columnWidth = 290;
    const gap = 25;
    const slots = [
      { place: 2, height: 256, radius: 38, medal: 52 },
      { place: 1, height: 290, radius: 44, medal: 64 },
      { place: 3, height: 240, radius: 36, medal: 52 },
    ];
    slots.forEach((slot, index) => {
      const x = 80 + index * (columnWidth + gap);
      const entry = podium.find((item) => item.place === slot.place);
      const cardTop = baseY - slot.height;
      const mine = !!entry?.playerIds.includes(playerId);
      const palette = this.placePalette(slot.place);
      const fill = context.createLinearGradient(0, cardTop, 0, baseY);
      fill.addColorStop(0, palette.top);
      fill.addColorStop(1, 'rgba(255,255,255,0.04)');
      context.save();
      if (mine) {
        context.shadowColor = gold;
        context.shadowBlur = 40;
      }
      this.roundRect(context, x, cardTop, columnWidth, slot.height, 30);
      context.fillStyle = fill;
      context.fill();
      context.restore();
      context.lineWidth = mine ? 4 : 2;
      context.strokeStyle = mine ? gold : palette.border;
      this.roundRect(context, x, cardTop, columnWidth, slot.height, 30);
      context.stroke();
      context.textAlign = 'center';
      context.fillStyle = '#ffffff';
      context.font = `${slot.medal}px sans-serif`;
      context.fillText(this.medal(slot.place), x + columnWidth / 2, cardTop - slot.medal * 0.55);
      const ids = entry?.playerIds ?? [];
      const overlap = slot.radius * 0.45;
      const facesWidth = ids.length * slot.radius * 2 - Math.max(0, ids.length - 1) * overlap;
      const facesY = cardTop + slot.medal * 0.55 + slot.radius + 18;
      ids.forEach((id, faceIndex) => {
        const cx = x + columnWidth / 2 - facesWidth / 2 + slot.radius + faceIndex * (slot.radius * 2 - overlap);
        this.drawAvatar(context, cx, facesY, slot.radius, this.playerName(state, id));
      });
      context.textAlign = 'center';
      const namesTop = facesY + slot.radius + 16;
      ids.forEach((id, nameIndex) => {
        const own = id === playerId;
        context.fillStyle = own ? gold : '#ffffff';
        context.font = `${own ? 800 : 700} 24px Manrope, sans-serif`;
        context.fillText(this.playerName(state, id), x + columnWidth / 2, namesTop + nameIndex * 31, columnWidth - 28);
      });
      context.fillStyle = 'rgba(255,255,255,0.62)';
      context.font = '800 17px "DM Sans", sans-serif';
      context.fillText(`${this.ordinal(slot.place)} LUGAR`, x + columnWidth / 2, baseY - 34);
      context.textAlign = 'left';
    });
  }

  private drawEditorialPodium(
    context: CanvasRenderingContext2D,
    state: TournamentState,
    podium: PodiumPlace[],
    playerId: string,
    top: number,
    gold: string,
  ): void {
    const slots = [1, 2, 3, 4];
    const gap = 14;
    const width = (920 - gap * (slots.length - 1)) / slots.length;
    slots.forEach((place, index) => {
      const x = 80 + index * (width + gap);
      const item = podium.find((value) => value.place === place);
      const mine = !!item?.playerIds.includes(playerId);
      const palette = this.placePalette(place);
      const fill = context.createLinearGradient(0, top, 0, top + 150);
      fill.addColorStop(0, mine ? 'rgba(230,195,106,0.30)' : palette.top);
      fill.addColorStop(1, 'rgba(255,255,255,0.04)');
      this.roundRect(context, x, top, width, 150, 20);
      context.fillStyle = fill;
      context.fill();
      context.lineWidth = mine ? 3 : 2;
      context.strokeStyle = mine ? gold : palette.border;
      context.stroke();
      context.textAlign = 'center';
      context.fillStyle = gold;
      context.font = '42px sans-serif';
      context.fillText(this.medal(place), x + width / 2, top + 18);
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.font = '800 18px Manrope, sans-serif';
      context.fillText(this.ordinal(place), x + width / 2, top + 70);
      context.fillStyle = mine ? gold : '#ffffff';
      context.font = '700 13px Manrope, sans-serif';
      (item?.playerIds ?? []).forEach((id, nameIndex) => {
        context.fillText(this.playerName(state, id), x + width / 2, top + 103 + nameIndex * 20, width - 12);
      });
    });
    context.textAlign = 'left';
  }

  private drawStatStrip(
    context: CanvasRenderingContext2D,
    standing: PlayerStanding,
    place: number,
    gold: string,
    y: number,
  ): void {
    const stats = [
      { label: 'POSIÇÃO', value: this.ordinal(place) },
      { label: 'VITÓRIAS', value: String(standing.setsWon) },
      { label: 'JOGOS', value: String(standing.matchesPlayed) },
      { label: 'SALDO', value: `${standing.gameBalance > 0 ? '+' : ''}${standing.gameBalance}` },
    ];
    const gap = 12;
    const width = (920 - gap * (stats.length - 1)) / stats.length;
    stats.forEach((stat, index) => {
      const x = 80 + index * (width + gap);
      this.roundRect(context, x, y, width, 98, 16);
      context.fillStyle = 'rgba(255,255,255,0.08)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.15)';
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.58)';
      context.font = '700 12px "DM Sans", sans-serif';
      context.fillText(stat.label, x + 14, y + 15, width - 28);
      context.fillStyle = gold;
      context.font = '800 27px Manrope, sans-serif';
      context.fillText(stat.value, x + 14, y + 45, width - 28);
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível carregar a imagem de fundo.'));
      image.src = src;
    });
  }

  private roundRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    topOnly = false,
  ): void {
    const bottom = topOnly ? 4 : radius;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, bottom);
    context.arcTo(x, y + height, x, y, bottom);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  private medal(place: number): string {
    return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';
  }

  private playerResults(state: TournamentState, playerId: string): PlayerMatchResult[] {
    const results: PlayerMatchResult[] = [];
    const addMatch = (match: Match, label: string): void => {
      const onA = match.teamA.includes(playerId);
      const onB = match.teamB.includes(playerId);
      if (!onA && !onB) return;
      const ownScore = onA ? match.scoreA : match.scoreB;
      const otherScore = onA ? match.scoreB : match.scoreA;
      const teammate = onA ? match.teamA.find((id) => id !== playerId) : match.teamB.find((id) => id !== playerId);
      const opponents = onA ? match.teamB : match.teamA;
      const score = ownScore === null || otherScore === null ? '—' : `${ownScore} × ${otherScore}`;
      const tieBreak =
        match.tieBreakA !== null &&
        match.tieBreakA !== undefined &&
        match.tieBreakB !== null &&
        match.tieBreakB !== undefined
          ? ` (${onA ? match.tieBreakA : match.tieBreakB}–${onA ? match.tieBreakB : match.tieBreakA})`
          : '';
      const won = ownScore === null || otherScore === null ? null : ownScore > otherScore;
      results.push({
        label,
        description: `Dupla com ${this.playerName(state, teammate)} · contra ${opponents.map((id) => this.playerName(state, id)).join(' + ')}`,
        score: `${score}${tieBreak}${won === null ? '' : won ? ' · V' : ' · D'}`,
        won,
      });
    };

    for (const round of state.rounds) {
      for (const match of round.matches)
        addMatch(match, `Rodada ${round.number}${match.groupId ? ` · ${this.groupName(state, match.groupId)}` : ''}`);
    }
    for (const match of state.finals?.matches ?? []) {
      addMatch(match, match.finalKind === 'championship' ? 'Final' : 'Disputa de terceiro lugar');
    }
    return results;
  }

  private playerName(state: TournamentState, playerId?: string): string {
    return state.players.find((player) => player.id === playerId)?.name ?? '—';
  }

  private groupName(state: TournamentState, groupId: string): string {
    return state.groups?.find((group) => group.id === groupId)?.name ?? groupId;
  }

  private ordinal(position: number): string {
    return `${position}º`;
  }
  private fileName(name: string): string {
    return `setpoint-${name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()}.png`;
  }
}
