import { Component, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Listbox } from 'primeng/listbox';
import { ChatStateService } from '../../core/chat-state.service';

@Component({
  selector: 'app-new-chat-dialog',
  imports: [FormsModule, Button, Dialog, InputText, Listbox],
  templateUrl: './new-chat-dialog.component.html',
  styleUrl: './new-chat-dialog.component.scss',
})
export class NewChatDialogComponent {
  protected chatState = inject(ChatStateService);

  readonly visible = model(false);
  readonly selectedUserIds = signal<string[]>([]);
  readonly groupName = signal('');
  readonly creating = signal(false);

  onHide(): void {
    this.selectedUserIds.set([]);
    this.groupName.set('');
  }

  async start(): Promise<void> {
    if (this.selectedUserIds().length === 0) return;
    this.creating.set(true);
    const name = this.selectedUserIds().length > 1 ? this.groupName().trim() || undefined : undefined;
    await this.chatState.createSession(this.selectedUserIds(), name);
    this.creating.set(false);
    this.visible.set(false);
    this.onHide();
  }
}
