import { Injectable } from '@angular/core';
import { FinalMatchKind, Match, TournamentState } from './models';

export interface TournamentReportMatch {
  label: string;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  tieBreak: string;
  pending: boolean;
}

export interface TournamentReportSection {
  title: string;
  matches: TournamentReportMatch[];
}

export interface TournamentReport {
  name: string;
  format: string;
  finishedAt: string;
  sections: TournamentReportSection[];
}

@Injectable({ providedIn: 'root' })
export class TournamentReportService {
  build(state: TournamentState): TournamentReport {
    if (!state.finishedAt) throw new Error('Finalize o torneio antes de gerar o relatório.');
    const players = new Map(state.players.map(player => [player.id, player.name]));
    const groups = new Map((state.groups ?? []).map(group => [group.id, group.name]));
    const finalLabels: Record<FinalMatchKind, string> = {
      quarterfinal: 'Quartas de final',
      semifinal: 'Semifinal',
      championship: 'Final',
      'third-place': 'Disputa de 3º lugar'
    };
    const formatMatch = (match: Match): TournamentReportMatch => {
      const location = [match.finalKind ? finalLabels[match.finalKind] : undefined,
        match.groupId ? groups.get(match.groupId) ?? match.groupId : undefined,
        `Quadra ${match.court}`].filter(Boolean).join(' · ');
      const team = (ids: [string, string]) => ids.map(id => players.get(id) ?? 'A definir').join(' + ');
      return {
        label: location,
        teamA: team(match.teamA),
        teamB: team(match.teamB),
        scoreA: match.scoreA === null ? '—' : String(match.scoreA),
        scoreB: match.scoreB === null ? '—' : String(match.scoreB),
        tieBreak: match.tieBreakA != null && match.tieBreakB != null ? `Tie-break ${match.tieBreakA}–${match.tieBreakB}` : '',
        pending: match.scoreA === null || match.scoreB === null
      };
    };
    const includeMatch = (match: Match) => !state.earlyFinalsEnabled || (match.scoreA !== null && match.scoreB !== null);
    const sections = state.rounds.map(round => ({
      title: `Rodada ${round.number}`,
      matches: round.matches.filter(includeMatch).map(formatMatch)
    })).filter(section => section.matches.length > 0);
    if (state.finals?.matches.length) {
      const matches = state.finals.matches.filter(includeMatch).map(formatMatch);
      if (matches.length) sections.push({ title: 'Fase final', matches });
    }
    const mode = state.tournamentMode === 'groups' ? 'Grupos' : 'Super';
    const doubles = state.doublesFormat === 'mixed' ? 'duplas mistas' : 'duplas abertas';
    return { name: state.name, format: `${mode} ${state.size} · ${doubles}`, finishedAt: state.finishedAt, sections };
  }

  toText(report: TournamentReport): string {
    const date = new Date(report.finishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const lines = ['SETPOINT · RELATÓRIO FINAL', report.name, report.format, `Finalizado em ${date}`];
    for (const section of report.sections) {
      lines.push('', section.title.toLocaleUpperCase());
      for (const match of section.matches) {
        lines.push(match.label, `${match.teamA} ${match.scoreA} × ${match.scoreB} ${match.teamB}${match.pending ? ' (pendente)' : ''}${match.tieBreak ? ` · ${match.tieBreak}` : ''}`);
      }
    }
    return lines.join('\n');
  }

  async toImage(report: TournamentReport): Promise<Blob> {
    if (document.fonts) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível gerar a imagem do relatório.');
    const width = 1200;
    const margin = 72;
    const lineHeight = 30;
    context.font = '800 32px Manrope, sans-serif';
    const nameLines = this.wrapText(context, report.name, width - margin * 2);
    context.font = '700 18px "DM Sans", sans-serif';
    const layout = report.sections.map(section => ({
      title: section.title,
      matches: section.matches.map(match => {
        const label = this.wrapText(context, `${match.label}${match.tieBreak ? ` · ${match.tieBreak}` : ''}${match.pending ? ' · Pendente' : ''}`, width - margin * 2 - 32);
        context.font = '600 22px "DM Sans", sans-serif';
        const teamA = this.wrapText(context, match.teamA, width - margin * 2 - 150);
        const teamB = this.wrapText(context, match.teamB, width - margin * 2 - 150);
        context.font = '700 18px "DM Sans", sans-serif';
        return { match, label, teamA, teamB, height: 24 + label.length * 25 + (teamA.length + teamB.length) * lineHeight + 20 };
      })
    }));
    const headerHeight = 185 + nameLines.length * 38;
    const height = headerHeight + layout.reduce((sum, section) =>
      sum + 62 + section.matches.reduce((matchSum, match) => matchSum + match.height, 0), 0) + 100;
    const scale = Math.min(1, 16384 / height, Math.sqrt(14_000_000 / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.textBaseline = 'top';
    context.fillStyle = '#f3f5f2';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#153d34';
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = '#d7bd75';
    context.font = '800 18px "DM Sans", sans-serif';
    context.fillText('SETPOINT  /  RELATÓRIO FINAL', margin, 48);
    context.fillStyle = '#ffffff';
    context.font = '800 32px Manrope, sans-serif';
    nameLines.forEach((line, index) => context.fillText(line, margin, 90 + index * 38));
    context.fillStyle = '#c9d8d1';
    context.font = '600 18px "DM Sans", sans-serif';
    context.fillText(report.format, margin, 105 + nameLines.length * 38);
    const date = new Date(report.finishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    context.fillText(`Finalizado em ${date}`, margin, 135 + nameLines.length * 38);

    let position = headerHeight;
    for (const section of layout) {
      position += 22;
      context.fillStyle = '#276452';
      context.font = '800 18px Manrope, sans-serif';
      context.fillText(section.title.toLocaleUpperCase(), margin, position);
      position += 40;
      for (const item of section.matches) {
        context.fillStyle = '#ffffff';
        context.fillRect(margin, position, width - margin * 2, item.height - 8);
        context.fillStyle = '#697a71';
        context.font = '700 18px "DM Sans", sans-serif';
        item.label.forEach((line, index) => context.fillText(line, margin + 16, position + 12 + index * 25));
        let teamY = position + 16 + item.label.length * 25;
        context.fillStyle = '#1c3028';
        context.font = '600 22px "DM Sans", sans-serif';
        item.teamA.forEach((line, index) => context.fillText(line, margin + 16, teamY + index * lineHeight));
        context.textAlign = 'right';
        context.font = '800 24px Manrope, sans-serif';
        context.fillText(item.match.scoreA, width - margin - 24, teamY);
        context.textAlign = 'left';
        teamY += item.teamA.length * lineHeight;
        context.font = '600 22px "DM Sans", sans-serif';
        item.teamB.forEach((line, index) => context.fillText(line, margin + 16, teamY + index * lineHeight));
        context.textAlign = 'right';
        context.font = '800 24px Manrope, sans-serif';
        context.fillText(item.match.scoreB, width - margin - 24, teamY);
        context.textAlign = 'left';
        position += item.height;
      }
    }
    context.fillStyle = '#697a71';
    context.font = '700 16px "DM Sans", sans-serif';
    context.fillText('SETPOINT · BEACH TENNIS', margin, height - 58);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Não foi possível preparar a imagem do relatório.')),
      'image/png'
    ));
  }

  private wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of value.trim().split(/\s+/).filter(Boolean)) {
      const combined = line ? `${line} ${word}` : word;
      if (context.measureText(combined).width <= maxWidth) {
        line = combined;
        continue;
      }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && context.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ['—'];
  }
}