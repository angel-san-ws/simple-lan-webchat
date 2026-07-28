import { Component, ElementRef, ViewChild, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Avatar } from 'primeng/avatar';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { ChatStateService } from '../../core/chat-state.service';
import { ChatMessage, ChatSession } from '../../core/models';
import { initialsOf } from '../../core/utils';

const TYPING_STOP_DELAY_MS = 2000;

@Component({
  selector: 'app-conversation',
  imports: [FormsModule, Avatar, Button, Textarea, Tooltip],
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
})
export class ConversationComponent {
  protected chatState = inject(ChatStateService);
  private messageService = inject(MessageService);

  readonly session = input.required<ChatSession>();
  readonly messageText = signal('');
  readonly editingMessageId = signal<string | null>(null);
  readonly editText = signal('');

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;

  private typingTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const count = this.session().messages.length;
      if (count >= 0) {
        queueMicrotask(() => this.scrollAnchor?.nativeElement.scrollIntoView({ block: 'end' }));
      }
    });
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  isOwn(message: ChatMessage): boolean {
    return message.from.id === this.chatState.currentUser()?.id;
  }

  canModify(message: ChatMessage): boolean {
    return this.isOwn(message) && !message.deletedAt;
  }

  isGroup(): boolean {
    return this.session().participants.length > 2;
  }

  participantSubtitle(): string {
    const others = this.session().participants.filter((p) => p.id !== this.chatState.currentUser()?.id);
    if (others.length === 0) return 'Just you';
    return `with ${others.map((p) => p.name).join(', ')}`;
  }

  typingLabel(): string {
    const users = this.chatState.typingBySession()[this.session().id] ?? [];
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].name} is typing...`;
    if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing...`;
    return `${users.length} people are typing...`;
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  onInputChange(value: string): void {
    this.messageText.set(value);
    this.chatState.setTyping(true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.chatState.setTyping(false), TYPING_STOP_DELAY_MS);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    if (!this.messageText().trim()) return;
    this.chatState.sendMessage(this.messageText());
    this.messageText.set('');
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.chatState.setTyping(false);
  }

  startEdit(message: ChatMessage): void {
    this.editingMessageId.set(message.id);
    this.editText.set(message.text);
  }

  cancelEdit(): void {
    this.editingMessageId.set(null);
    this.editText.set('');
  }

  onEditKeydown(event: KeyboardEvent, message: ChatMessage): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit(message);
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  async saveEdit(message: ChatMessage): Promise<void> {
    const text = this.editText().trim();
    if (!text || text === message.text) {
      this.cancelEdit();
      return;
    }

    const result = await this.chatState.editMessage(message.id, text);
    if (result.ok) {
      this.cancelEdit();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Edit failed',
        detail: result.error ?? 'Could not edit message.',
      });
    }
  }

  async deleteMessage(message: ChatMessage): Promise<void> {
    if (!confirm('Delete this message? This cannot be undone.')) return;

    const result = await this.chatState.deleteMessage(message.id);
    if (!result.ok) {
      this.messageService.add({
        severity: 'error',
        summary: 'Delete failed',
        detail: result.error ?? 'Could not delete message.',
      });
    }
  }
}
