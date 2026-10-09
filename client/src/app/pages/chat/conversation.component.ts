import { Component, ElementRef, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Avatar } from 'primeng/avatar';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { ChatStateService } from '../../core/chat-state.service';
import { Attachment, ChatMessage, ChatSession } from '../../core/models';
import { initialsOf } from '../../core/utils';

const TYPING_STOP_DELAY_MS = 2000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-conversation',
  imports: [FormsModule, Avatar, Button, Textarea, Tooltip],
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
  host: {
    '(document:paste)': 'onPaste($event)',
  },
})
export class ConversationComponent {
  protected chatState = inject(ChatStateService);
  private messageService = inject(MessageService);

  readonly session = input.required<ChatSession>();
  readonly messageText = signal('');
  readonly editingMessageId = signal<string | null>(null);
  readonly editText = signal('');
  readonly dragActive = signal(false);
  private readonly pendingUploads = signal(0);
  readonly uploading = computed(() => this.pendingUploads() > 0);

  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private typingTimeout?: ReturnType<typeof setTimeout>;
  private dragDepth = 0;

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

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.sendFiles(files);
  }

  onDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragDepth++;
    this.dragActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragDepth = 0;
    this.dragActive.set(false);
    void this.sendFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data || data.files.length === 0) return;
    // Apps like Excel/Word put an image rendition next to the copied text; treat those as text pastes.
    if (data.types.includes('text/plain')) return;
    event.preventDefault();
    void this.sendFiles(Array.from(data.files).map((file) => this.renamePastedImage(file)));
  }

  private hasFiles(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('Files');
  }

  /** Clipboard screenshots all arrive as "image.png"; give them a distinguishable name. */
  private renamePastedImage(file: File): File {
    const match = /^image\.(\w+)$/.exec(file.name);
    if (!match) return file;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    return new File([file], `pasted-image-${stamp}.${match[1]}`, { type: file.type });
  }

  private async sendFiles(files: File[]): Promise<void> {
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        this.messageService.add({
          severity: 'error',
          summary: 'File too large',
          detail: `${file.name} is larger than 25 MB.`,
        });
        continue;
      }

      this.pendingUploads.update((n) => n + 1);
      const result = await this.chatState.uploadFile(file);
      this.pendingUploads.update((n) => n - 1);

      if (!result.ok || !result.attachment) {
        this.messageService.add({
          severity: 'error',
          summary: 'Upload failed',
          detail: result.error ?? `Could not upload ${file.name}.`,
        });
        continue;
      }

      this.chatState.sendMessage(this.messageText(), result.attachment);
      this.messageText.set('');
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.chatState.setTyping(false);
    }
  }

  downloadUrl(attachment: Attachment): string {
    return `${attachment.url}?name=${encodeURIComponent(attachment.name)}`;
  }

  isImage(message: ChatMessage): boolean {
    return !!message.attachment?.mimeType.startsWith('image/');
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
