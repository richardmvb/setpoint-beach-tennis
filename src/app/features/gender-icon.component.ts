import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PlayerGender } from '../core/models';

@Component({
  selector: 'app-gender-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="gender-icon" [class.male]="gender === 'male'" [class.female]="gender === 'female'" viewBox="0 0 24 24" aria-hidden="true">@if (gender === 'male') {<circle cx="10" cy="14" r="5"></circle><path d="M13.5 10.5 20 4m-5 0h5v5"></path>} @else {<circle cx="12" cy="9" r="5"></circle><path d="M12 14v7m-3-3h6"></path>}</svg>`
})
export class GenderIconComponent { @Input() gender: PlayerGender | undefined = 'male'; }
