import { Injectable } from '@angular/core';

const MAX_SOURCE_BYTES = 8_000_000;
const MAX_AVATAR_BYTES = 8_000;

@Injectable({ providedIn: 'root' })
export class AvatarService {
  async compress(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem.');
    if (file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original deve ter até 8 MB.');
    const image = await createImageBitmap(file);
    try {
      for (const [size, quality] of [[96, 0.68], [80, 0.56], [64, 0.48]] as const) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível processar a foto.');
        const scale = Math.max(size / image.width, size / image.height);
        context.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= MAX_AVATAR_BYTES) return await this.toDataUrl(blob);
      }
    } finally {
      image.close();
    }
    throw new Error('A foto ficou grande demais. Escolha uma imagem mais simples.');
  }

  private toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Foto inválida.'));
      reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
      reader.readAsDataURL(blob);
    });
  }
}
