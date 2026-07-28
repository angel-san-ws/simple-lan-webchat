import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { ChatStateService } from '../../core/chat-state.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Button, InputText, Card, Message],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private chatState = inject(ChatStateService);
  private router = inject(Router);

  readonly name = signal(this.chatState.savedDisplayName);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.error.set('Please enter a display name.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const result = await this.chatState.join(trimmed);
    this.submitting.set(false);

    if (result.ok) {
      this.router.navigateByUrl('/chat');
    } else {
      this.error.set(result.error ?? 'Could not connect to the chat server.');
    }
  }
}
