import { ChangeDetectionStrategy, Component } from '@angular/core';
import { help } from '../../core/i18n/help.de';

/** In-app help: supported files and limits, citations, the Ollama warning and privacy. */
@Component({
  selector: 'app-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 class="text-3xl font-semibold tracking-tight">{{ h.title }}</h1>
      <p class="mt-2 text-muted">{{ h.intro }}</p>
      <nav aria-label="Inhalt" class="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        @for (s of h.sections; track s.id) { <a class="text-primary underline" [href]="'#' + s.id">{{ s.title }}</a> }
      </nav>
      @for (s of h.sections; track s.id) {
        <section class="mt-10" [attr.id]="s.id" [attr.aria-labelledby]="s.id + '-title'">
          <h2 [attr.id]="s.id + '-title'" class="mb-3 text-xl font-semibold">{{ s.title }}</h2>
          <div class="space-y-3 leading-relaxed">
            @for (p of s.paragraphs; track $index) { <p>{{ p }}</p> }
          </div>
        </section>
      }
    </div>
  `,
})
export class HelpPage {
  protected readonly h = help;
}
