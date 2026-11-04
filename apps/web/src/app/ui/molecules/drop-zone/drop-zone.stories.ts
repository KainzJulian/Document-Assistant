import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DropZoneComponent } from './drop-zone.component';

const meta: Meta<DropZoneComponent> = {
  title: 'Molecules/Drop zone',
  component: DropZoneComponent,
  render: (args) => ({
    props: args,
    template: `<app-drop-zone><div class="rounded-card border border-border bg-surface p-10 text-center text-muted">Dateien hierher ziehen (ziehe eine Datei über diese Fläche)</div></app-drop-zone>`,
  }),
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<DropZoneComponent>;

/** Wraps any content; a dragged file highlights the whole area. */
export const Default: Story = {};
