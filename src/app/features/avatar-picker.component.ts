import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  inject,
  output,
} from '@angular/core';

import { AvatarService } from '../core/avatar.service';

@Component({
  selector: 'app-avatar-picker',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:inline-block;position:relative}'],
  template: `
    <button
      class="avatar-trigger"
      type="button"
      (click)="menuOpen = !menuOpen"
      [attr.aria-expanded]="menuOpen"
      aria-haspopup="menu"
      [attr.aria-label]="value ? 'Alterar foto' : 'Adicionar foto'"
    >
      @if (value) {
        <img [src]="value" alt="" />
      } @else {
        @if (processing) {
          <span class="avatar-trigger-icon" aria-hidden="true">…</span>
        } @else {
          <svg class="avatar-camera-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h3l1.4-2h7.2L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path>
            <circle cx="12" cy="13" r="3.5"></circle>
          </svg>
        }
      }
    </button>
    @if (menuOpen) {
      <div class="avatar-menu" role="menu">
        <label class="avatar-menu-item" role="menuitem"
          >Tirar foto<input type="file" accept="image/*" capture="user" hidden (change)="pick($event)"
        /></label>
        <label class="avatar-menu-item" role="menuitem"
          >Escolher da galeria<input type="file" accept="image/*" hidden (change)="pick($event)"
        /></label>
        @if (value) {
          <button class="avatar-menu-item danger" type="button" role="menuitem" (click)="remove()">Remover foto</button>
        }
      </div>
    }
    @if (error) {
      <small class="avatar-error" role="alert">{{ error }}</small>
    }
  `,
})
export class AvatarPickerComponent {
  private readonly avatars = inject(AvatarService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  @Input() value = '';
  readonly valueChange = output<string>();
  menuOpen = false;
  processing = false;
  error = '';

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: Event): void {
    if (this.menuOpen && !this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen = false;
      this.changeDetector.markForCheck();
    }
  }

  async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.menuOpen = false;
    if (!file) return;
    this.error = '';
    this.processing = true;
    this.changeDetector.markForCheck();
    try {
      this.valueChange.emit(await this.avatars.compress(file));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível processar a foto.';
    } finally {
      this.processing = false;
      this.changeDetector.markForCheck();
    }
  }

  remove(): void {
    this.menuOpen = false;
    this.error = '';
    this.valueChange.emit('');
  }
}
