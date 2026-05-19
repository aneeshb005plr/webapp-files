// src/app/chat/components/chat-window/chat-window.component.ts

import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
  effect,
} from '@angular/core';
import { ChatStore }               from '../../store/chat.store';
import { MessageBubbleComponent }  from '../message-bubble/message-bubble.component';
import { ThinkingIndicatorComponent } from '../thinking-indicator/thinking-indicator.component';
import { MessageInputComponent }   from '../message-input/message-input.component';
import { StarterPromptsComponent } from '../starter-prompts/starter-prompts.component';

@Component({
  selector:        'app-chat-window',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [
    MessageBubbleComponent,
    ThinkingIndicatorComponent,
    MessageInputComponent,
    StarterPromptsComponent,
  ],
  templateUrl:     './chat-window.component.html',
  styleUrl:        './chat-window.component.scss',
})
export class ChatWindowComponent implements AfterViewChecked {

  protected readonly store = inject(ChatStore);

  private readonly messagesEnd =
    viewChild<ElementRef<HTMLDivElement>>('messagesEnd');

  // Smart scroll — auto-scroll unless user scrolled up
  private shouldAutoScroll = true;
  private lastScrollTop    = 0;

  constructor() {
    // Auto-scroll when new messages arrive or streaming content changes
    effect(() => {
      // Track these signals to trigger effect
      const _ = this.store.messages();
      const __ = this.store.streamingContent();
      if (this.shouldAutoScroll) {
        this.scrollToBottom();
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll) {
      this.scrollToBottom();
    }
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    // If user scrolls up more than 100px — stop auto-scroll
    if (distanceFromBottom > 100) {
      this.shouldAutoScroll = false;
    } else {
      this.shouldAutoScroll = true;
    }
  }

  onLoadMore(): void {
    const conv = this.store.activeConversationId();
    const before = this.store.nextBefore();
    if (conv && before) {
      this.store.loadMoreMessages({ conversationId: conv, before });
    }
  }

  onStarterPrompt(prompt: string): void {
    this.store.sendMessage(prompt);
  }

  private scrollToBottom(): void {
    try {
      this.messagesEnd()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
    } catch { /* ignore */ }
  }

  // Track by for performance
  trackByMessageId(_: number, msg: { message_id: string }): string {
    return msg.message_id;
  }
}