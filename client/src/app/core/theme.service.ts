import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'lan-webchat.theme';
const DARK_CLASS = 'app-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);

  readonly theme = signal<Theme>(this.loadTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Storage may be unavailable (e.g. private mode); the theme still applies for this session.
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private loadTheme(): Theme {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
}
