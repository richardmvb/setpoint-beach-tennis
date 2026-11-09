import { Injectable } from '@angular/core';
import { PathGoal, PathProjection } from './qualification.service';

/** Shareable "meu caminho" image (same visual language as the podium share card). */
@Injectable({ providedIn: 'root' })
export class PathCardService {
  async render(path: PathProjection, goal: PathGoal, tournamentName: string): Promise<Blob> {
    const width = 1080;
    const height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível gerar a imagem do seu caminho.');
    const gold = '#e6c36a';
    const background = context.createLinearGradient(0, 0, width * 0.6, height);
    background.addColorStop(0, '#0a1f19');
    background.addColorStop(0.5, '#123b30');
    background.addColorStop(1, '#07140f');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    const glow = context.createRadialGradient(width - 120, 160, 10, width - 120, 160, 640);
    glow.addColorStop(0, 'rgba(230,195,106,0.30)');
    glow.addColorStop(1, 'rgba(230,195,106,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.textBaseline = 'top';
    context.fillStyle = gold;
    context.font = '800 28px Manrope, sans-serif';
    context.fillText('SETPOINT', 80, 84);
    context.fillStyle = 'rgba(255,255,255,0.62)';
    context.font = '600 17px "DM Sans", sans-serif';
    context.fillText(`${tournamentName.toLocaleUpperCase()}  ·  MEU CAMINHO`, 80, 128, 920);
    context.fillStyle = '#ffffff';
    context.font = '800 64px Manrope, sans-serif';
    context.fillText(path.playerName, 80, 176, 920);

    // gauge
    const cx = 540;
    const cy = 560;
    const radius = 190;
    context.lineWidth = 36;
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    const tint = goal.status === 'eliminated' ? '#9aa6a0' : goal.status === 'clinched' ? '#5fe0a8' : gold;
    if (goal.probability > 0) {
      context.strokeStyle = tint;
      context.beginPath();
      context.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, goal.probability));
      context.stroke();
    }
    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.font = '800 130px Manrope, sans-serif';
    const big = goal.status === 'clinched' ? '✓' : goal.status === 'eliminated' ? '—' : this.percent(goal.probability);
    context.fillText(big, cx, cy - 78, 300);
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.font = '700 24px "DM Sans", sans-serif';
    const goalLabel = goal.goal === 1 ? 'DE SER CAMPEÃO' : `DE CHEGAR AO TOP ${goal.goal}`;
    context.fillText(goal.status === 'alive' ? goalLabel : goal.headline.toLocaleUpperCase(), cx, cy + 62, 330);

    context.fillStyle = '#ffffff';
    context.font = '800 38px Manrope, sans-serif';
    context.fillText(goal.status === 'alive' ? goal.headline : goal.detail, cx, 840, 920);

    // place distribution
    const places = path.placeDistribution.slice(0, 6);
    const maxValue = Math.max(0.01, ...places);
    const barWidth = 120;
    const gap = 26;
    const totalWidth = places.length * barWidth + (places.length - 1) * gap;
    places.forEach((value, index) => {
      const x = cx - totalWidth / 2 + index * (barWidth + gap);
      const barHeight = Math.max(6, (value / maxValue) * 150);
      const inGoal = index + 1 <= goal.goal;
      context.fillStyle = inGoal ? gold : 'rgba(255,255,255,0.22)';
      context.beginPath();
      context.roundRect(x, 1060 - barHeight, barWidth, barHeight, 14);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.font = '700 22px Manrope, sans-serif';
      context.fillText(`${index + 1}º`, x + barWidth / 2, 1076);
      context.fillStyle = '#ffffff';
      context.font = '800 20px "DM Sans", sans-serif';
      context.fillText(this.percent(value), x + barWidth / 2, 1060 - barHeight - 30);
    });
    context.fillStyle = 'rgba(255,255,255,0.55)';
    context.font = '600 20px "DM Sans", sans-serif';
    context.fillText('CHANCE DE TERMINAR EM CADA COLOCAÇÃO', cx, 1130);

    context.textAlign = 'left';
    context.fillStyle = 'rgba(255,255,255,0.5)';
    context.font = '600 18px "DM Sans", sans-serif';
    context.fillText('Todos os jogos restantes considerados equilibrados · SETPOINT', 80, 1262, 920);

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.')), 'image/png'));
  }

  private percent(value: number): string {
    if (value <= 0) return '0%';
    if (value < 0.01) return '<1%';
    if (value > 0.99 && value < 1) return '>99%';
    return `${Math.round(value * 100)}%`;
  }
}
