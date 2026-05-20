// src/app/chat/components/sidebar/sidebar.component.ts

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  NgZone,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormsModule }  from '@angular/forms';
import { ChatStore }    from '../../store/chat.store';
import { Conversation } from '../../models/chat.models';
import { timeAgo }      from '../../utils/time-ago.util';

@Component({
  selector:        'app-sidebar',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [FormsModule],
  templateUrl:     './sidebar.component.html',
  styleUrl:        './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  protected readonly store   = inject(ChatStore);
  private  readonly cdr     = inject(ChangeDetectorRef);
  private  readonly ngZone  = inject(NgZone);

  protected readonly confirmDeleteId = signal<string | null>(null);

  // Timer reference for cleanup
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Current tick value — plain number, not a signal
  // We manually call markForCheck() every minute to force re-render
  private currentTick = 0;

  ngOnInit(): void {
    // Update timeAgo every 60 seconds
    // Run inside Angular zone so OnPush change detection triggers
    this.tickTimer = setInterval(() => {
      this.currentTick++;
      // NgZone.run() ensures Angular's change detection picks this up
      // even though setInterval runs outside Angular zone by default
      this.ngZone.run(() => this.cdr.markForCheck());
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // Called from template — currentTick is read so re-renders when it changes
  protected getTimeAgo(dateStr: string | null): string {
    // currentTick read here ensures this recalculates on each tick
    void this.currentTick;
    return timeAgo(dateStr);
  }

  onNewConversation(): void {
    this.store.createConversation();
  }

  onSelect(conversation: Conversation): void {
    this.store.selectConversation(conversation.conversation_id);
  }

  onSearchChange(query: string): void {
    this.store.setSearchQuery(query);
  }

  onDeleteClick(event: Event, conversationId: string): void {
    event.stopPropagation();
    this.confirmDeleteId.set(conversationId);
  }

  onConfirmDelete(event: Event, conversationId: string): void {
    event.stopPropagation();
    this.store.deleteConversation(conversationId);
    this.confirmDeleteId.set(null);
  }

  onCancelDelete(event: Event): void {
    event.stopPropagation();
    this.confirmDeleteId.set(null);
  }

  onToggleSidebar(): void {
    this.store.toggleSidebar();
  }

  trackByConversationId(_: number, conv: Conversation): string {
    return conv.conversation_id;
  }
}