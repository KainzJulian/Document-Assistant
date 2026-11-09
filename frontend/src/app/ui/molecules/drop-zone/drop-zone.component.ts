import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { de } from '../../../core/i18n/de';

/**
 * Wraps a page area so files can be dropped anywhere on it, and owns the hidden file picker.
 *
 * Call `pick()` (for example from an upload button) to open the picker. Emits the chosen files.
 */
@Component({
  selector: 'app-drop-zone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input #picker type="file" multiple class="hidden" [attr.aria-label]="pickLabel" [accept]="accept()" (change)="onPick($event)" />
    <div (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
      <ng-content />
    </div>
    @if (dragging()) {
      <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-card border-2 border-dashed border-primary bg-primary-soft/80 text-lg font-medium text-primary">
        {{ label }}
      </div>
    }
  `,
})
export class DropZoneComponent {
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');
  protected readonly label = de.library.dropNow;
  protected readonly pickLabel = de.library.pickFiles;
  protected readonly dragging = signal(false);

  /** Accepted file extensions for the picker. */
  readonly accept = input('.pdf,.txt,.md,.markdown,.docx,.pptx,.html,.htm,.epub');
  /** Emits the files the person chose or dropped. */
  readonly filesSelected = output<File[]>();

  /** Open the native file picker. */
  pick(): void {
    this.picker().nativeElement.click();
  }

  /**
   * Allow dropping and show the highlight.
   * @param event - The drag event.
   */
  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  /**
   * Emit dropped files.
   * @param event - The drop event.
   */
  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.filesSelected.emit(files);
  }

  /**
   * Emit files chosen in the picker and reset it so the same file can be chosen again.
   * @param event - The change event.
   */
  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.filesSelected.emit(files);
  }
}
