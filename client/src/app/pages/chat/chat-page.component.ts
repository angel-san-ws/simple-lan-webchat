import { Component, inject, signal } from '@angular/core';
import { Avatar } from 'primeng/avatar';
import { Badge } from 'primeng/badge';
import { Button } from 'primeng/button';
import { Divider } from 'primeng/divider';
import { Tooltip } from 'primeng/tooltip';
import { ChatStateService } from '../../core/chat-state.service';
import { ChatSession } from '../../core/models';
import { initialsOf } from '../../core/utils';
import { ConversationComponent } from './conversation.component';
import { NewChatDialogComponent } from './new-chat-dialog.component';

@Component({
  selector: 'app-chat-page',
  imports: [Avatar, Badge, Button, Divider, Tooltip, ConversationComponent, NewChatDialogComponent],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.scss',
})
export class ChatPageComponent {
  protected chatState = inject(ChatStateService);

  readonly newChatVisible = signal(false);

  initialsFor(name: string | undefined): string {
    return initialsOf(name);
  }

  lastMessagePreview(session: ChatSession): string {
    const last = session.messages.at(-1);
    if (!last) return 'No messages yet';
    const prefix = last.from.id === this.chatState.currentUser()?.id ? 'You: ' : '';
    const body = last.text || (last.attachment ? `📎 ${last.attachment.name}` : '');
    return `${prefix}${body}`;
  }

  unreadFor(sessionId: string): number {
    return this.chatState.unreadBySession()[sessionId] ?? 0;
  }

  openNewChat(): void {
    this.newChatVisible.set(true);
  }

  async startDirectChat(userId: string): Promise<void> {
    const existing = this.chatState
      .sessions()
      .find(
        (s) =>
          s.participantIds.length === 2 &&
          s.participantIds.includes(userId) &&
          s.participantIds.includes(this.chatState.currentUser()?.id ?? ''),
      );
    if (existing) {
      this.chatState.selectSession(existing.id);
      return;
    }
    await this.chatState.createSession([userId]);
  }
}
