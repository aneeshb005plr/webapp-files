// src/app/chat/components/sidebar/sidebar.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule }  from '@angular/forms';
import { toSignal }     from '@angular/core/rxjs-interop';
import { interval }     from 'rxjs';
import { startWith }    from 'rxjs/operators';
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
export class SidebarComponent {
  protected readonly store = inject(ChatStore);

  // Ticks every 60 seconds — forces timeAgo to recalculate in template
  // OnPush components only re-render on signal changes — this provides the trigger
  protected readonly tick = toSignal(
    interval(60_000).pipe(startWith(0)),
    { initialValue: 0 }
  );

  protected readonly confirmDeleteId = signal<string | null>(null);

  // timeAgo as method so it recalculates when tick() changes
  protected getTimeAgo(dateStr: string | null): string {
    this.tick(); // read tick signal — creates dependency so template updates every minute
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