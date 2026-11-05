import { provideRouter } from '@angular/router';
import { applicationConfig } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CitationPanelComponent } from './citation-panel.component';

const meta: Meta<CitationPanelComponent> = {
  title: 'Organisms/Citation panel',
  component: CitationPanelComponent,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  parameters: { layout: 'fullscreen' },
  args: {
    number: 1,
    loading: false,
    gone: false,
    chunk: {
      id: 'c1',
      document_id: 'd1',
      document_title: 'Mietvertrag Wohnung Linz',
      page_from: 4,
      page_to: 4,
      section_path: '§ 7 Kündigung',
      text: 'Der Mieter kann das Mietverhältnis unter Einhaltung einer Frist von drei Monaten zum Monatsletzten schriftlich kündigen.',
    },
  },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<CitationPanelComponent>;

/** The passage behind a citation. */
export const Default: Story = {};
/** Loading the passage. */
export const Loading: Story = { args: { loading: true, chunk: null } };
/** The document was deleted. */
export const Deleted: Story = { args: { gone: true, chunk: null } };
