import { Component, computed, inject } from '@angular/core';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [Button, Tooltip],
  template: `
    <p-button
      [icon]="isDark() ? 'pi pi-sun' : 'pi pi-moon'"
      [rounded]="true"
      [text]="true"
      [ariaLabel]="label()"
      [pTooltip]="label()"
      tooltipPosition="left"
      (onClick)="themeService.toggle()"
    />
  `,
})
export class ThemeToggleComponent {
  protected themeService = inject(ThemeService);

  protected readonly isDark = computed(() => this.themeService.theme() === 'dark');
  protected readonly label = computed(() => (this.isDark() ? 'Switch to light theme' : 'Switch to dark theme'));
}
