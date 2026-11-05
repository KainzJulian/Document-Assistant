import type { Meta, StoryObj } from '@storybook/angular-vite';
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
/** Nothing to choose from. */
export const Empty: Story = { args: { documents: [], selected: [] } };
