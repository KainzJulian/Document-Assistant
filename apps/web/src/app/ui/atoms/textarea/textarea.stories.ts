import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TextareaComponent } from './textarea.component';

const meta: Meta<TextareaComponent> = {
  title: 'Atoms/Textarea',
  component: TextareaComponent,
  args: { label: 'Text einfügen', value: '', rows: 4, placeholder: 'Text hier einfügen …', disabled: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<TextareaComponent>;

/** Multi-line field. */
export const Default: Story = {};
/** With content. */
export const Filled: Story = { args: { value: 'Der Mieter kann das Mietverhältnis unter Einhaltung einer Frist von drei Monaten kündigen.' } };
