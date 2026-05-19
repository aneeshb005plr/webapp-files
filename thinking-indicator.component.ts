// src/app/chat/components/thinking-indicator/thinking-indicator.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { ThinkingEvent } from '../../models/chat.models';

@Component({
  selector:        'app-thinking-indicator',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl:     './thinking-indicator.component.html',
  styleUrl:        './thinking-indicator.component.scss',
})
export class ThinkingIndicatorComponent {
  readonly events    = input<ThinkingEvent[]>([]);
  readonly isVisible = input<boolean>(false);

  get latestEvent(): ThinkingEvent | null {
    const evts = this.events();
    return evts.length > 0 ? evts[evts.length - 1] : null;
  }

  getEventLabel(event: ThinkingEvent): string {
    switch (event.type) {
      case 'agent_thinking':
        return event.status ?? 'Thinking...';
      case 'tool_call':
        return `Searching: ${event.query ?? ''}`;
      case 'tool_result':
        return event.found
          ? 'Found relevant information'
          : 'No results found';
      default:
        return 'Processing...';
    }
  }

  getEventIcon(event: ThinkingEvent): string {
    switch (event.type) {
      case 'agent_thinking': return '🧠';
      case 'tool_call':      return '🔍';
      case 'tool_result':    return event.found ? '✓' : '○';
      default:               return '⚡';
    }
  }
}