// src/app/chat/components/starter-prompts/starter-prompts.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  output,
} from '@angular/core';

const STARTER_PROMPTS = [
  'My Astro login is not working',
  'How do I submit my timesheet in Astro?',
  'I cannot access my email on Outlook',
  'How do I reset my network password?',
  'My laptop is running very slowly',
  'I need to request software installation',
];

@Component({
  selector:        'app-starter-prompts',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="starters">
      <div class="starters__header">
        <span class="starters__icon">✦</span>
        <h3 class="starters__title">How can I help you today?</h3>
        <p class="starters__subtitle">
          Ask me about any IT issue or select a common question below
        </p>
      </div>
      <div class="starters__grid">
        @for (prompt of prompts; track prompt) {
          <button
            class="starters__card"
            (click)="promptSelected.emit(prompt)"
          >
            {{ prompt }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .starters {
      display:        flex;
      flex-direction: column;
      align-items:    center;
      padding:        2rem 1rem;
      gap:            1.5rem;
      flex:           1;
      justify-content: center;

      &__header {
        text-align: center;
        display:    flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
      }

      &__icon {
        font-size:  1.5rem;
        color:      #d04a02;
        display:    block;
      }

      &__title {
        font-size:   1.1rem;
        font-weight: 600;
        color:       var(--app-text-primary);
        margin:      0;
      }

      &__subtitle {
        font-size: 0.85rem;
        color:     var(--app-text-secondary);
        margin:    0;
        max-width: 320px;
        line-height: 1.5;
      }

      &__grid {
        display:               grid;
        grid-template-columns: repeat(2, 1fr);
        gap:                   0.6rem;
        width:                 100%;
        max-width:             560px;
      }

      &__card {
        background:    var(--app-bg-container);
        border:        1px solid var(--app-border);
        border-radius: 10px;
        padding:       0.75rem 1rem;
        text-align:    left;
        cursor:        pointer;
        font-size:     0.82rem;
        color:         var(--app-text-primary);
        font-family:   inherit;
        line-height:   1.4;
        transition:    border-color 0.15s ease,
                       box-shadow 0.15s ease,
                       background 0.15s ease;
        font-weight:   500;

        &:hover {
          border-color: #d04a02;
          background:   var(--app-bg-hover);
          box-shadow:   0 2px 8px rgba(208, 74, 2, 0.1);
        }

        &:active {
          transform: scale(0.98);
        }
      }
    }
  `],
})
export class StarterPromptsComponent {
  readonly promptSelected = output<string>();
  protected readonly prompts = STARTER_PROMPTS;
}