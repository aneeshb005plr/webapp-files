// src/app/chat/components/message-bubble/message-bubble.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { ChatStore } from '../../store/chat.store';
import { Message }   from '../../models/chat.models';

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

  protected readonly store       = inject(ChatStore);
  protected readonly copied           = signal(false);
  protected readonly showSources      = signal(false);
  protected readonly showFeedbackPanel = signal(false);
  protected readonly selectedFeedback  = signal<string | null>(null);

  protected readonly feedbackOptions = [
    { label: 'Wrong information',   value: 'wrong_info' },
    { label: 'Not relevant',        value: 'not_relevant' },
    { label: 'Incomplete answer',   value: 'incomplete' },
    { label: 'Hard to understand',  value: 'unclear' },
  ];

  async copyMessage(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message().content);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch { /* clipboard not available */ }
  }

  toggleSources(): void {
    this.showSources.update(v => !v);
  }

  setReaction(reaction: 'thumbs_up' | 'thumbs_down'): void {
    const msg = this.message();
    if (msg.reaction === reaction) return;
    this.store.addReaction({ messageId: msg.message_id, reaction });
  }

  onThumbsDown(): void {
    const msg = this.message();
    if (msg.reaction === 'thumbs_down') return;  // already submitted
    this.showFeedbackPanel.set(true);
    this.selectedFeedback.set(null);
  }

  selectFeedback(value: string): void {
    this.selectedFeedback.set(value);
  }

  submitFeedback(): void {
    if (!this.selectedFeedback()) return;
    this.store.addReaction({ messageId: this.message().message_id, reaction: 'thumbs_down' });
    this.showFeedbackPanel.set(false);
  }

  cancelFeedback(): void {
    this.showFeedbackPanel.set(false);
    this.selectedFeedback.set(null);
  }

  get formattedContent(): string {
    let html = this.message().content;

    // Escape any existing HTML to prevent XSS
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Markdown links: [text](url) → clickable link
    // Handles: [text](https://...) — full URLs only
    // Also handles: [text](#) or [text]() — empty/hash URLs shown as plain text span
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="bubble__inline-link">$1 ↗</a>'
    );

    // Markdown links with empty or hash URL — render as styled span not link
    html = html.replace(
      /\[([^\]]+)\]\((#|)\)/g,
      '<span class="bubble__inline-text">$1</span>'
    );

    // Headers: ### → h3, ## → h2, # → h1
    html = html.replace(/^### (.+)$/gm, '<h3 class="bubble__h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm,  '<h2 class="bubble__h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm,   '<h1 class="bubble__h1">$1</h1>');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code class="bubble__code-inline">$1</code>');

    // Unordered list items: - item or * item
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g,
      match => `<ul class="bubble__list">${match}</ul>`
    );

    // Numbered list items: 1. item
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Horizontal rule: ---
    html = html.replace(/^---$/gm, '<hr class="bubble__hr">');

    // Line breaks: double newline → paragraph break
    html = html.replace(/\n\n/g, '</p><p class="bubble__para">');

    // Single newline → <br>
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<p')) {
      html = `<p class="bubble__para">${html}</p>`;
    }

    return html;
  }
}