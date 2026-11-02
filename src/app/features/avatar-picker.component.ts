import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarService } from '../core/avatar.service';

@Component({
  selector: 'app-avatar-picker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:inline-block;position:relative}'],
  template: `
    <button class="avatar-trigger" type="button" (click)="menuOpen = !menuOpen" [attr.aria-expanded]="menuOpen" aria-haspopup="menu" [attr.aria-label]="value ? 'Alterar foto' : 'Adicionar foto'">
      <img *ngIf="value; else placeholder" [src]="value" alt="">
      <ng-template #placeholder><span class="avatar-trigger-icon" aria-hidden="true">{{ processing ? '…' : '+' }}</span></ng-template>
    </button>
    <div *ngIf="menuOpen" class="avatar-menu" role="menu">
      <label class="avatar-menu-item" role="menuitem">Tirar foto<input type="file" accept="image/*" capture="user" hidden (change)="pick($event)"></label>
      <label class="avatar-menu-item" role="menuitem">Escolher da galeria<input type="file" accept="image/*" hidden (change)="pick($event)"></label>
      <button *ngIf="value" class="avatar-menu-item danger" type="button" role="menuitem" (click)="remove()">Remover foto</button>
    </div>
    <small *ngIf="error" class="avatar-error" role="alert">{{ error }}</small>
  `
})
export class AvatarPickerComponent {
  private readonly avatars = inject(AvatarService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
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
