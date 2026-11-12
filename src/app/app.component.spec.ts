import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// The tour targets live in the monolith's source and template, so the spec reads both files as text.
// The unit-test environment is not a file: URL, so paths resolve from the workspace root that `ng test` runs in.
const appDir = join(process.cwd(), 'src/app');
const component = readFileSync(join(appDir, 'app.component.ts'), 'utf8');
const template = readFileSync(join(appDir, 'app.component.html'), 'utf8');

describe('app.component (setup tour)', () => {
  it('todo alvo do tutorial da configuração existe no template', () => {
    const block = component.slice(
      component.indexOf('private setupTourSteps'),
      component.indexOf('async startSetupTour'),
    );
    const selectors = [...block.matchAll(/element: '([^']+)'/g)].map((match) => match[1]);
    expect(selectors.length >= 12, 'esperava passos para as três etapas').toBeTruthy();
    for (const selector of selectors) {
      const id = selector.slice(1);
      const hasId =
        selector.startsWith('#') && (template.includes(`id="${id}"`) || template.includes(`inputId="${id}"`));
      const hasClass = selector.startsWith('.') && template.includes(selector.slice(1));
      const hasAttribute = selector.startsWith('[') && template.includes(selector.slice(1, -1).replace(/"/g, '"'));
      expect(hasId || hasClass || hasAttribute, `alvo do tutorial ausente no template: ${selector}`).toBeTruthy();
    }
  });

  it('cada etapa tem a chave de tutorial própria e o botão "Ver tutorial"', () => {
    expect(component).toMatch(/tourKey\(step: number\)/);
    expect((template.match(/\(click\)="startSetupTour\(\)"/g) ?? []).length).toBe(3);
  });
});
