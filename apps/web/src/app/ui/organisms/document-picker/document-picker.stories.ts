import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DocumentPickerComponent } from './document-picker.component';

const meta: Meta<DocumentPickerComponent> = {
  title: 'Organisms/Document picker',
  component: DocumentPickerComponent,
  args: {
    selected: ['d1'],
    documents: [
      { id: 'd1', title: 'Mietvertrag Wohnung Linz', meta: 'PDF · 2,4 MB' },
      { id: 'd2', title: 'Jahresbericht 2025 Energie AG', meta: 'PDF · 9,1 MB' },
      { id: 'd3', title: 'Garantiebedingungen Geschirrspüler', meta: 'DOCX · 310 KB' },
    ],
  },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<DocumentPickerComponent>;

/** Search, tick, "Alle auswählen". */
export const Default: Story = {};
/** Searching narrows the list; "Alle auswählen" ticks what is left, a second press clears it. */
export const SearchAndSelectAll: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Dokumente suchen' }), 'garantie');
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.clear(canvas.getByRole('searchbox', { name: 'Dokumente suchen' }));
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Alle auswählen' }));
    for (const box of canvas.getAllByRole('checkbox')) await expect(box).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Alle auswählen' }));
    for (const box of canvas.getAllByRole('checkbox')) await expect(box).not.toBeChecked();
  },
};
/** Nothing to choose from. */
export const Empty: Story = { args: { documents: [], selected: [] } };
