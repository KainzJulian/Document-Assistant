import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SpinnerComponent } from './spinner.component';

const meta: Meta<SpinnerComponent> = {
  title: 'Atoms/Spinner',
  component: SpinnerComponent,
  args: { size: 24 },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<SpinnerComponent>;

/** Loading indicator; takes the text colour. */
export const Default: Story = {};
