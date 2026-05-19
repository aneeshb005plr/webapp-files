// src/app/chat/components/chat-window/chat-window.component.ts

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  signal,
  viewChild,
  effect,
  untracked,
} from '@angular/core';
import { ChatStore }                  from '../../store/chat.store';
import { MessageBubbleComponent }     from '../message-bubble/message-bubble.component';
import { ThinkingIndicatorComponent } from '../thinking-indicator/thinking-indicator.component';
import { MessageInputComponent }      from '../message-input/message-input.component';
import { StarterPromptsComponent }    from '../starter-prompts/starter-prompts.component';

@Component({
  selector:        'app-chat-window',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessageBubbleComponent,
    ThinkingIndicatorComponent,
    MessageInputComponent,
    StarterPromptsComponent,
  ],
  templateUrl: './chat-window.component.html',
  styleUrl:    './chat-window.component.scss',
})
export class ChatWindowComponent implements AfterViewInit, OnDestroy {

  protected readonly store = inject(ChatStore);
  private  readonly cdr   = inject(ChangeDetectorRef);
  private  readonly zone  = inject(NgZone);

  private readonly scrollContainer =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  private shouldAutoScroll = true;
  private scrollRafId: number | null = null;

  protected readonly showScrollDown = signal(false);

  constructor() {
    // Watch message count — new message added → scroll if auto-scroll on
    effect(() => {
      const count = this.store.messages().length;
      untracked(() => {
        if (count > 0 && this.shouldAutoScroll) {
          this.scheduleScroll('instant');
        }
      });
    });

    // Watch streaming tokens — follow stream if auto-scroll on
    effect(() => {
      const content = this.store.streamingContent();
      untracked(() => {
        if (content && this.shouldAutoScroll) {
          this.scheduleScroll('instant');
        }
      });
    });

    // Watch streaming start — ALWAYS scroll when user sends message
    effect(() => {
      const streaming = this.store.isStreaming();
      untracked(() => {
        if (streaming) {
          this.shouldAutoScroll = true;
          this.showScrollDown.set(false);
          this.scheduleScroll('smooth');
          this.cdr.markForCheck();
        }
      });
    });
  }

  ngAfterViewInit(): void {
    // Initial scroll to bottom when component loads
    setTimeout(() => this.scrollToBottom('instant'), 50);
  }

  ngOnDestroy(): void {
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
    }
  }

  // Called by message-input via (messageSent) output
  forceScrollDown(): void {
    this.shouldAutoScroll = true;
    this.showScrollDown.set(false);
    // Use setTimeout to ensure DOM has updated with new message
    setTimeout(() => this.scrollToBottom('smooth'), 50);
  }

  onScroll(event: Event): void {
    const el             = event.target as HTMLElement;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (distFromBottom > 150) {
      this.shouldAutoScroll = false;
      if (this.store.messages().length > 0 || this.store.streamingContent()) {
        this.showScrollDown.set(true);
        this.cdr.markForCheck();
      }
    } else {
      this.shouldAutoScroll = true;
      this.showScrollDown.set(false);
      this.cdr.markForCheck();
    }
  }

  scrollToBottomClick(): void {
    this.shouldAutoScroll = true;
    this.showScrollDown.set(false);
    this.scrollToBottom('smooth');
  }

  onLoadMore(): void {
    const conv   = this.store.activeConversationId();
    const before = this.store.nextBefore();
    if (!conv || !before) return;

    const el               = this.scrollContainer()?.nativeElement;
    const heightBefore     = el?.scrollHeight ?? 0;

    this.store.loadMoreMessages({ conversationId: conv, before });

    // Restore scroll position after older messages load
    setTimeout(() => {
      if (el) {
        el.scrollTop = el.scrollHeight - heightBefore;
      }
    }, 100);
  }

  onStarterPrompt(prompt: string): void {
    this.store.sendMessage(prompt);
    this.shouldAutoScroll = true;
    this.showScrollDown.set(false);
  }

  trackByMessageId(_: number, msg: { message_id: string }): string {
    return msg.message_id;
  }

  private scheduleScroll(behavior: ScrollBehavior): void {
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
    }
    this.zone.runOutsideAngular(() => {
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollToBottom(behavior);
        this.scrollRafId = null;
      });
    });
  }

  private scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }
}