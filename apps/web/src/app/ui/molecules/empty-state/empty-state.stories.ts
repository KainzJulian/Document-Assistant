import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ButtonComponent } from '../../atoms/button/button.component';
import { EmptyStateComponent } from './empty-state.component';

const meta: Meta<EmptyStateComponent> = {
  title: 'Molecules/Empty state',
  component: EmptyStateComponent,
  decorators: [moduleMetadata({ imports: [ButtonComponent] })],
  args: { title: 'Noch keine Dokumente', description: 'Lade dein erstes Dokument hoch, dann kannst du Fragen dazu stellen.' },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<EmptyStateComponent>;

/** Title and text only. */
export const Default: Story = {};
/** With a call to action. */
export const WithAction: Story = {
  render: (args) => ({
    props: args,
    template: `<app-empty-state [title]="title" [description]="description"><app-button variant="primary">Dokument hochladen</app-button></app-empty-state>`,
  }),
};
