import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ImportDialogComponent } from './import-dialog.component';

const meta: Meta<ImportDialogComponent> = {
  title: 'Organisms/Import dialog',
  component: ImportDialogComponent,
  args: { open: true, mode: 'url', busy: false, error: '', offerText: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ImportDialogComponent>;

/** Enter an address. */
export const Url: Story = {};
/** The page could not be read: reason shown, paste offered. */
export const PageFailed: Story = {
  args: {
    error: 'Auf dieser Seite wurde nicht genug Text gefunden. Vielleicht braucht sie JavaScript oder eine Anmeldung.',
    offerText: true,
  },
};
/** Paste the text instead. */
export const PasteText: Story = { args: { mode: 'text' } };
