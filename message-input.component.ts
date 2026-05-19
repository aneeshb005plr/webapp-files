// src/app/chat/components/message-input/message-input.component.ts

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatStore }   from '../../store/chat.store';

@Component({
  selector:        'app-message-input',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [FormsModule],
  templateUrl:     './message-input.component.html',
  styleUrl:        './message-input.component.scss',
})
export class MessageInputComponent implements AfterViewInit, OnDestroy {

  protected readonly store   = inject(ChatStore);
  protected readonly message = signal('');

  private readonly textareaRef =
    viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  ngAfterViewInit(): void {
    this.textareaRef()?.nativeElement.focus();
  }

  ngOnDestroy(): void {}

  onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.message.set(el.value);
    this.autoResize(el);
  }

  onKeyDown(event: KeyboardEvent): void {
    // Enter to send, Shift+Enter for new line
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.message().trim();
    if (!text || !this.store.canSend()) return;

    this.store.sendMessage(text);
    this.message.set('');

    // Reset textarea height
    const el = this.textareaRef()?.nativeElement;
    if (el) {
      el.value = '';
      el.style.height = 'auto';
    }
  }

  stop(): void {
    this.store.stopStreaming();
  }

  private autoResize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  get charCount(): number {
    return this.message().length;
  }

  get isOverLimit(): boolean {
    return this.charCount > 2000;
  }
}