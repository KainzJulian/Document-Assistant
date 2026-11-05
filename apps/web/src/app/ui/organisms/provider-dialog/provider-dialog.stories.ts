import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ProviderDialogComponent } from './provider-dialog.component';

const meta: Meta<ProviderDialogComponent> = {
  title: 'Organisms/Provider dialog',
  component: ProviderDialogComponent,
  args: { open: true, provider: null, busy: false, error: '' },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ProviderDialogComponent>;

/** Add a new provider. */
export const Add: Story = {};
/** Edit an existing provider: the key field is blank and keeps the stored key. */
export const Edit: Story = {
  args: { provider: { id: 1, kind: 'anthropic', label: 'Anthropic', base_url: null, enabled: true, has_key: true, models: [] } },
};
/** A save failed. */
export const WithError: Story = { args: { error: 'Der API-Schlüssel wurde abgelehnt oder fehlt.' } };
