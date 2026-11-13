import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ButtonComponent } from './button.component';

@Component({
  imports: [ButtonComponent],
  template: `
    <button uiButton id="plain">Plain</button>
    <button uiButton id="primary" variant="primary" class="extra">Primary</button>
    <button uiButton id="danger" variant="danger" size="sm">Danger</button>
    <button uiButton id="ghost" variant="ghost" [disabled]="true">Ghost</button>
    <button uiButton id="submit" type="submit">Submit</button>
    <a uiButton id="link" href="/somewhere" variant="primary">Link</a>
  `,
})
class HostComponent {}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const get = (id: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`#${id}`)!;
  return { get };
}

describe('uiButton', () => {
  it('is a secondary medium button by default and never submits a form by accident', () => {
    const element = render().get('plain');
    expect(element.classList.contains('button')).toBe(true);
    expect(element.classList.contains('secondary')).toBe(true);
    expect(element.classList.contains('sm')).toBe(false);
    expect(element.getAttribute('type')).toBe('button');
  });

  it('applies the variant and keeps classes written on the element', () => {
    const element = render().get('primary');
    expect([...element.classList].sort()).toEqual(['button', 'extra', 'primary']);
  });

  it('applies the small size and the danger variant', () => {
    const element = render().get('danger');
    expect(element.classList.contains('danger')).toBe(true);
    expect(element.classList.contains('sm')).toBe(true);
  });

  it('applies the ghost variant and honors disabled', () => {
    const element = render().get('ghost') as HTMLButtonElement;
    expect(element.classList.contains('ghost')).toBe(true);
    expect(element.disabled).toBe(true);
  });

  it('lets a button be a submit button when asked', () => {
    expect(render().get('submit').getAttribute('type')).toBe('submit');
  });

  it('works on a link, without a type attribute', () => {
    const element = render().get('link');
    expect(element.tagName).toBe('A');
    expect(element.classList.contains('button')).toBe(true);
    expect(element.classList.contains('primary')).toBe(true);
    expect(element.hasAttribute('type')).toBe(false);
    expect(element.getAttribute('href')).toBe('/somewhere');
  });

  it('shows its content', () => {
    expect(render().get('plain').textContent).toBe('Plain');
  });
});
