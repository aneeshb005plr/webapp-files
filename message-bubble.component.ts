// src/app/chat/components/message-bubble/message-bubble.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Message } from '../../models/chat.models';
import { ChatStore } from '../../store/chat.store';

@Component({
  selector:        'app-message-bubble',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl:     './message-bubble.component.html',
  styleUrl:        './message-bubble.component.scss',
})
export class MessageBubbleComponent {
  readonly message     = input.required<Message>();
  readonly isStreaming = input<boolean>(false);

  protected readonly store      = inject(ChatStore);
  protected readonly copied     = signal(false);
  protected readonly showSources = signal(false);

  async copyMessage(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message().content);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  toggleSources(): void {
    this.showSources.update(v => !v);
  }

  setReaction(reaction: 'thumbs_up' | 'thumbs_down'): void {
    const msg = this.message();
    // Toggle off if same reaction
    if (msg.reaction === reaction) return;
    this.store.addReaction({ messageId: msg.message_id, reaction });
  }

  get formattedContent(): string {
    // Basic markdown-like formatting
    return this.message().content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}