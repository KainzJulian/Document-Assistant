import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Citation } from '../../../core/api';
import { de } from '../../../core/i18n/de';
import { Inline, parseMarkdown } from '../../../domain/markdown';
import { SpinnerComponent } from '../../atoms/spinner/spinner.component';

/** The sentence the assistant uses when the documents do not contain the answer. */
export const NOT_FOUND_TEXT = 'Dazu finde ich in den ausgewählten Dokumenten nichts.';

const CITE =
  'ml-0.5 inline-block min-w-5 cursor-pointer rounded-full bg-primary-soft px-1.5 text-center align-baseline text-xs font-semibold text-primary hover:opacity-80 pointer-coarse:min-w-8 pointer-coarse:py-1';

/** One piece of inline text, flattened so the template needs no type narrowing. */
interface Part {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'cite';
  text: string;
  /** Citation number (0 for other pieces). */
  n: number;
  /** For citations: whether a source with this number exists. */
  valid: boolean;
}

/** One block of the answer, flattened. */
interface View {
  k: 'p' | 'h' | 'ul' | 'ol' | 'code';
  parts: Part[];
  items: Part[][];
  text: string;
}

/**
 * One chat message: the person's question as a soft pill, or the assistant's answer as formatted
 * text with numbered source chips. Actions (copy, regenerate) are shown under finished answers.
 */
@Component({
  selector: 'app-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <ng-template #inline let-parts>
      @for (p of parts; track $index) {
        @switch (p.kind) {
          @case ('bold') { <strong>{{ p.text }}</strong> }
          @case ('italic') { <em>{{ p.text }}</em> }
          @case ('code') { <code class="rounded bg-surface-muted px-1 text-sm">{{ p.text }}</code> }
          @case ('cite') {
            @if (p.valid) {
              <button type="button" [class]="cite" [attr.aria-label]="t.sources + ' ' + p.n" (click)="citationClicked.emit(p.n)">{{ p.n }}</button>
            } @else {
              <span>[{{ p.n }}]</span>
            }
          }
          @default { <span>{{ p.text }}</span> }
        }
      }
    </ng-template>

    @if (role() === 'user') {
      <div class="flex justify-end"><p class="max-w-[85%] rounded-card bg-surface-muted px-4 py-2.5 whitespace-pre-wrap">{{ content() }}</p></div>
    } @else {
      <div class="space-y-2" [attr.id]="'msg-' + messageId()">
        @if (error()) {
          <p role="alert" class="rounded-control border border-danger bg-danger-soft px-4 py-3 text-danger">{{ error() }}</p>
        } @else if (isNotFound()) {
          <p class="rounded-control border border-border bg-surface px-4 py-3 text-muted">{{ content() }}</p>
        } @else if (!content() && streaming()) {
          <span class="inline-flex items-center gap-2 text-sm text-muted"><app-spinner [size]="14" />{{ t.assistant }}</span>
        } @else {
          <div class="space-y-3 leading-relaxed">
            @for (b of views(); track $index) {
              @switch (b.k) {
                @case ('h') { <p class="text-lg font-semibold"><ng-container *ngTemplateOutlet="inline; context: { $implicit: b.parts }" /></p> }
                @case ('ul') {
                  <ul class="list-disc space-y-1 pl-6">
                    @for (item of b.items; track $index) { <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li> }
                  </ul>
                }
                @case ('ol') {
                  <ol class="list-decimal space-y-1 pl-6">
                    @for (item of b.items; track $index) { <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li> }
                  </ol>
                }
                @case ('code') { <pre class="overflow-x-auto rounded-control bg-surface-muted p-3 text-sm">{{ b.text }}</pre> }
                @default { <p><ng-container *ngTemplateOutlet="inline; context: { $implicit: b.parts }" /></p> }
              }
            }
          </div>
        }
        @if (interrupted()) { <p class="text-xs text-muted">{{ t.interrupted }}</p> }
        @if (!streaming() && !error() && content()) {
          <div class="flex gap-1 text-sm text-muted">
            <button type="button" class="min-h-9 cursor-pointer rounded-control px-2 hover:bg-surface-muted hover:text-foreground pointer-coarse:min-h-11" (click)="copied.emit()">{{ t.copy }}</button>
            @if (canRegenerate()) {
              <button type="button" class="min-h-9 cursor-pointer rounded-control px-2 hover:bg-surface-muted hover:text-foreground pointer-coarse:min-h-11" (click)="regenerate.emit()">{{ t.regenerate }}</button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class MessageComponent {
  protected readonly t = de.chat;
  protected readonly cite = CITE;

  /** `user` or `assistant`. */
  readonly role = input.required<'user' | 'assistant'>();
  /** Message id (anchor for "scroll to the match"). */
  readonly messageId = input('');
  /** The text. */
  readonly content = input('');
  /** Sources of the answer. */
  readonly citations = input<Citation[]>([]);
  /** True while the answer streams. */
  readonly streaming = input(false);
  /** True if the answer was stopped before it finished. */
  readonly interrupted = input(false);
  /** Error text if the answer failed. */
  readonly error = input('');
  /** Show "Neu generieren" (only for the last answer). */
  readonly canRegenerate = input(false);
  /** Emits the number of the clicked source chip. */
  readonly citationClicked = output<number>();
  /** Emits when "Kopieren" is pressed. */
  readonly copied = output<void>();
  /** Emits when "Neu generieren" is pressed. */
  readonly regenerate = output<void>();

  protected readonly isNotFound = computed(() => this.content().trim() === NOT_FOUND_TEXT);
  protected readonly views = computed<View[]>(() =>
    parseMarkdown(this.content()).map((block) => {
      if (block.k === 'code') return { k: 'code', parts: [], items: [], text: block.text };
      if (block.k === 'ul' || block.k === 'ol') return { k: block.k, parts: [], items: block.items.map((i) => this.flatten(i)), text: '' };
      return { k: block.k, parts: this.flatten(block.inline), items: [], text: '' };
    }),
  );

  /**
   * Flatten inline pieces into parts the template can render without narrowing.
   * @param inline - Pieces from the Markdown parser.
   * @returns Flat parts.
   */
  private flatten(inline: Inline[]): Part[] {
    return inline.map((i) =>
      i.t === 'cite'
        ? { kind: 'cite', text: '', n: i.n, valid: this.citations().some((c) => c.n === i.n) }
        : { kind: i.t, text: i.v, n: 0, valid: false },
    );
  }
}
