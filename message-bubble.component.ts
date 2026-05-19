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
  protected readonly copied      = signal(false);
  protected readonly showSources = signal(false);

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

  get formattedContent(): string {
    let html = this.message().content;

    // Escape any existing HTML to prevent XSS
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Markdown links: [text](url) → <a href="url">text</a>
    // Must run BEFORE other replacements
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="bubble__inline-link">$1</a>'
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