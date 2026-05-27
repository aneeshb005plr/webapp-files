// src/app/chat/components/message-bubble/message-bubble.component.ts
// Uses ngx-markdown v20 MarkdownPipe for proper markdown rendering.
// DOMPurify sanitisation configured globally in app.config.ts via SANITIZE token.
//
// Install before using:
//   npm install ngx-markdown@20 dompurify
//   npm install --save-dev @types/dompurify
//
// app.config.ts: provideMarkdown({ sanitize: { provide: SANITIZE, useValue: sanitizeFn } })
// See MARKDOWN_SETUP.md for full setup instructions.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
}                        from '@angular/core';
import { MarkdownPipe }  from 'ngx-markdown';
import { ChatStore }     from '../../store/chat.store';
import { Message }       from '../../models/chat.models';

@Component({
  selector:        'app-message-bubble',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [MarkdownPipe],
  templateUrl:     './message-bubble.component.html',
  styleUrl:        './message-bubble.component.scss',
})
export class MessageBubbleComponent {
  readonly message     = input.required<Message>();
  readonly isStreaming = input<boolean>(false);

  protected readonly store             = inject(ChatStore);
  protected readonly copied            = signal(false);
  protected readonly showSources       = signal(false);
  protected readonly showFeedbackPanel = signal(false);
  protected readonly selectedFeedback  = signal<string | null>(null);

  protected readonly feedbackOptions: readonly { label: string; value: string }[] = [
    { label: 'Wrong information',  value: 'wrong_info' },
    { label: 'Not relevant',       value: 'not_relevant' },
    { label: 'Incomplete answer',  value: 'incomplete' },
    { label: 'Hard to understand', value: 'unclear' },
  ];

  // Computed signal — strips citation source URLs from content before markdown render.
  // Source URLs are shown in the citations panel — no need to duplicate in text.
  // Runs reactively when message() changes (each token during streaming).
  protected readonly processedContent = computed(() => {
    const msg     = this.message();
    let   content = msg.content ?? '';
    const sources = msg.sources ?? [];

    // Strip markdown links whose URL is already shown in citations panel
    // Replaces [text](https://sharepoint.com/...) with just text
    if (sources.length > 0) {
      const sourceUrls = new Set(sources.map(s => s.source_url).filter(Boolean));
      content = content.replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        (_match, text, url) => sourceUrls.has(url) ? text : `[${text}](${url})`,
      );
    }

    return content;
  });

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
    if (this.message().reaction === 'thumbs_down') return;
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
}