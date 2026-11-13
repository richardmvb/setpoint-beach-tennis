import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CardComponent } from './card.component';

@Component({
  imports: [CardComponent],
  template: `
    <section uiCard id="default" class="mine"><p>Body</p></section>
    <article uiCard id="large" padding="lg">Large</article>
    <div uiCard id="flush" padding="none">Flush</div>
  `,
})
class HostComponent {}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return (id: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`#${id}`)!;
}

describe('uiCard', () => {
  it('is a surface with medium padding by default, and keeps its own tag, classes and content', () => {
    const element = render()('default');
    expect(element.tagName).toBe('SECTION');
    expect([...element.classList].sort()).toEqual(['mine', 'surface-card']);
    expect(element.querySelector('p')?.textContent).toBe('Body');
  });

  it('offers larger padding', () => {
    const element = render()('large');
    expect(element.classList.contains('card-lg')).toBe(true);
    expect(element.classList.contains('card-flush')).toBe(false);
  });

  it('offers no padding', () => {
    const element = render()('flush');
    expect(element.classList.contains('card-flush')).toBe(true);
    expect(element.classList.contains('card-lg')).toBe(false);
  });
});
