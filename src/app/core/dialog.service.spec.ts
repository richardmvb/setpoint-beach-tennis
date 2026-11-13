import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesPhrase } from './dialog.service';

describe('dialog service', () => {
  it('finalizar só é aceito quando a palavra é digitada, ignorando caixa e espaços', () => {
    expect(matchesPhrase('finalizar', 'finalizar')).toBe(true);
    expect(matchesPhrase('  Finalizar ', 'finalizar')).toBe(true);
    expect(matchesPhrase('FINALIZAR', 'finalizar')).toBe(true);
    expect(matchesPhrase('finaliza', 'finalizar')).toBe(false);
    expect(matchesPhrase('finalizar torneio', 'finalizar')).toBe(false);
    expect(matchesPhrase('', 'finalizar')).toBe(false);
  });

  it('nenhum confirm nativo restou no app', () => {
    // Read the sources directly: a native dialog call is a text pattern, not something to import.
    const adapters = readdirSync(join(process.cwd(), 'src/app/core/adapters/supabase'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => `core/adapters/supabase/${file}`);
    const files = ['app.component.ts', 'core/storage.service.ts', ...adapters];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), 'src/app', file), 'utf8');
      expect(source, `${file} usa diálogo nativo`).not.toMatch(/(?<![\w.])(confirm|alert|prompt)\(/);
    }
  });
});
