const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../src/app');
const component = fs.readFileSync(path.join(root, 'app.component.ts'), 'utf8');
const template = fs.readFileSync(path.join(root, 'app.component.html'), 'utf8');

test('todo alvo do tutorial da configuração existe no template', () => {
  const block = component.slice(component.indexOf('private setupTourSteps'), component.indexOf('async startSetupTour'));
  const selectors = [...block.matchAll(/element: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(selectors.length >= 12, 'esperava passos para as três etapas');
  for (const selector of selectors) {
    const id = selector.slice(1);
    const hasId = selector.startsWith('#') && (template.includes(`id="${id}"`) || template.includes(`inputId="${id}"`));
    const hasClass = selector.startsWith('.') && template.includes(selector.slice(1));
    const hasAttribute = selector.startsWith('[') && template.includes(selector.slice(1, -1).replace(/"/g, '"'));
    assert.ok(hasId || hasClass || hasAttribute, `alvo do tutorial ausente no template: ${selector}`);
  }
});

test('cada etapa tem a chave de tutorial própria e o botão "Ver tutorial"', () => {
  assert.match(component, /tourKey\(step: number\)/);
  assert.equal((template.match(/\(click\)="startSetupTour\(\)"/g) ?? []).length, 3);
});
