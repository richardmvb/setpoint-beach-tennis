import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import sharedPtBr from '../../../../../public/i18n/shared/pt-BR.json';
import { translocoTesting } from '../../../testing/transloco-testing';
import { GuestJoinFormComponent } from './guest-join-form.component';

async function setup(inputs: { mixed?: boolean; busy?: boolean } = {}) {
  const joinRequested = vi.fn();
  const { fixture } = await render(GuestJoinFormComponent, {
    imports: [translocoTesting({ 'shared/pt-BR': sharedPtBr })],
    inputs,
    on: { joinRequested },
  });
  return { joinRequested, component: fixture.componentInstance };
}

const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: /Participar|Entrando…/ });

describe('GuestJoinFormComponent', () => {
  it('asks for a name before joining', async () => {
    const { joinRequested, component } = await setup();
    expect(submit().disabled).toBe(true);
    fireEvent.input(screen.getByRole('textbox', { name: 'Seu nome' }), { target: { value: 'Ana' } });
    expect(component.name()).toBe('Ana');
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(joinRequested).toHaveBeenCalledTimes(1);
  });

  it('in a mixed tournament also asks for the category', async () => {
    const { component } = await setup({ mixed: true });
    fireEvent.input(screen.getByRole('textbox', { name: 'Seu nome' }), { target: { value: 'Ana' } });
    expect(submit().disabled).toBe(true);
    component.gender.set('female');
    await waitFor(() => expect(submit().disabled).toBe(false));
  });

  it('shows that it is joining', async () => {
    await setup({ busy: true });
    expect(submit().textContent?.trim()).toBe('Entrando…');
    expect(submit().disabled).toBe(true);
  });
});
