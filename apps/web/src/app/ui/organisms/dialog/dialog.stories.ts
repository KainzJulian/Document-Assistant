import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ButtonComponent } from '../../atoms/button/button.component';
import { DialogComponent } from './dialog.component';

const meta: Meta<DialogComponent> = {
  title: 'Organisms/Dialog',
  component: DialogComponent,
  decorators: [moduleMetadata({ imports: [ButtonComponent] })],
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<DialogComponent>;

/** Open dialog with a body and two buttons. Esc and a click outside close it. */
export const Open: Story = {
  render: () => ({
    props: { open: true },
    template: `
      <app-button (click)="open = true">Dialog öffnen</app-button>
      <app-dialog [(open)]="open" title="Keine GPU – Antworten sehr langsam" description="llama3.1:8b läuft nur auf der CPU.">
        <p class="text-sm">Server-RAM: 16 GB gesamt, 11,2 GB frei. Geschätzter Bedarf: 5,9 GB.</p>
        <ng-container dialog-actions>
          <app-button (click)="open = false">Abbrechen</app-button>
          <app-button variant="primary" (click)="open = false">Trotzdem verwenden</app-button>
        </ng-container>
      </app-dialog>`,
  }),
};
