import { describe, it, expect } from 'vitest';
import { parseProfile, serializeProfile, profileAutoJoin, shouldPromptProfile } from './profile';

describe('profile', () => {
  it('perfil vazio ou inválido volta ao padrão (entrar automaticamente ligado)', () => {
    expect(parseProfile(null)).toStrictEqual({ name: '', autoJoin: true });
    expect(parseProfile('{oops')).toStrictEqual({ name: '', autoJoin: true });
    expect(parseProfile('"texto"')).toStrictEqual({ name: '', autoJoin: true });
  });

  it('sanitiza nome, foto e categoria', () => {
    const profile = parseProfile(
      JSON.stringify({
        name: `  ${'a'.repeat(60)} `,
        photoDataUrl: 'javascript:alert(1)',
        gender: 'x',
        autoJoin: false,
      }),
    );
    expect(profile.name.length).toBe(40);
    expect(profile.photoDataUrl).toBeUndefined();
    expect(profile.gender).toBeUndefined();
    expect(profile.autoJoin).toBe(false);
    const round = parseProfile(
      serializeProfile({ name: 'Ana', photoDataUrl: 'data:image/webp;base64,AA', gender: 'female', autoJoin: true }),
    );
    expect(round).toStrictEqual({
      name: 'Ana',
      autoJoin: true,
      photoDataUrl: 'data:image/webp;base64,AA',
      gender: 'female',
    });
  });

  it('entra automaticamente só quando ligado, com nome, vaga e sem duplicar', () => {
    const ana = { name: 'Ana', autoJoin: true, photoDataUrl: 'data:image/webp;base64,AA' };
    expect(profileAutoJoin(ana, [], 8, false)).toStrictEqual({
      player: { name: 'Ana', photoDataUrl: 'data:image/webp;base64,AA' },
    });
    expect(profileAutoJoin({ ...ana, autoJoin: false }, [], 8, false)).toStrictEqual({ skipped: 'off' });
    expect(profileAutoJoin({ name: '  ', autoJoin: true }, [], 8, false)).toStrictEqual({ skipped: 'no-name' });
    expect(profileAutoJoin(ana, [{ id: '1', name: 'ana' }], 8, false)).toStrictEqual({ skipped: 'present' });
    expect(profileAutoJoin(ana, [{ id: '1', name: 'Bia' }], 1, false)).toStrictEqual({ skipped: 'full' });
  });

  it('torneio misto exige categoria no perfil', () => {
    expect(profileAutoJoin({ name: 'Caio', autoJoin: true }, [], 8, true)).toStrictEqual({ skipped: 'needs-gender' });
    expect(profileAutoJoin({ name: 'Caio', autoJoin: true, gender: 'male' }, [], 8, true)).toStrictEqual({
      player: { name: 'Caio', gender: 'male' },
    });
    expect(profileAutoJoin({ name: 'Caio', autoJoin: true, gender: 'male' }, [], 8, false)).toStrictEqual({
      player: { name: 'Caio' },
    });
  });

  it('o perfil é oferecido uma única vez, e só enquanto estiver vazio', () => {
    expect(shouldPromptProfile({ name: '', autoJoin: true }, false)).toBe(true);
    expect(shouldPromptProfile({ name: '   ', autoJoin: true }, false)).toBe(true);
    expect(shouldPromptProfile({ name: '', autoJoin: true }, true)).toBe(false);
    expect(shouldPromptProfile({ name: 'Ana', autoJoin: true }, false)).toBe(false);
  });
});
