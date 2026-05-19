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

  // Auto-scroll flag — false when user has scrolled up
  private shouldAutoScroll = true;

  // Show "scroll to bottom" button when user is scrolled up
  protected readonly showScrollDown = signal(false);

  // Debounce scroll during streaming to prevent lag
  private scrollRafId: number | null = null;

  constructor() {
    // React to new messages — always scroll to bottom
    effect(() => {
      const messages = store.messages();
      if (messages.length > 0 && this.shouldAutoScroll) {
        this.scheduleScroll('instant');
      }
    });

    // React to streaming tokens — smooth follow only if auto-scroll on
    effect(() => {
      const content = store.streamingContent();
      if (content && this.shouldAutoScroll) {
        this.scheduleScroll('instant');   // instant during streaming — no lag
      }
    });

    // When streaming starts — always re-enable auto-scroll
    // User sent a message so they want to see the response
    effect(() => {
      if (store.isStreaming()) {
        this.shouldAutoScroll  = true;
        this.showScrollDown.set(false);
        this.scheduleScroll('smooth');
      }
    });
  }

  ngAfterViewInit(): void {
    this.scrollToBottom('instant');
  }

  ngOnDestroy(): void {
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
    }
  }

  // Called by message-input when user sends — force scroll down
  forceScrollDown(): void {
    this.shouldAutoScroll = true;
    this.showScrollDown.set(false);
    this.scheduleScroll('smooth');
  }

  onScroll(event: Event): void {
    const el              = event.target as HTMLElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    // If user scrolled up more than 150px — stop auto scroll
    if (distanceFromBottom > 150) {
      this.shouldAutoScroll = false;
      // Show scroll-to-bottom button only if there are messages
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
    if (conv && before) {
      // Capture scroll height before loading so we can restore position
      const el = this.scrollContainer()?.nativeElement;
      const scrollHeightBefore = el?.scrollHeight ?? 0;

      this.store.loadMoreMessages({ conversationId: conv, before });

      // After messages load, restore scroll position so it doesn't jump
      setTimeout(() => {
        if (el) {
          const added = el.scrollHeight - scrollHeightBefore;
          el.scrollTop = added;   // keeps same visual position
        }
      }, 50);
    }
  }

  onStarterPrompt(prompt: string): void {
    this.store.sendMessage(prompt);
    // Force scroll down when starter prompt clicked
    this.shouldAutoScroll = true;
  }

  trackByMessageId(_: number, msg: { message_id: string }): string {
    return msg.message_id;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private scheduleScroll(behavior: ScrollBehavior): void {
    // Cancel any pending scroll frame
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
    }
    // Schedule outside Angular zone to avoid triggering change detection
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