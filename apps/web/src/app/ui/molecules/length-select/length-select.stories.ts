import type { Meta, StoryObj } from '@storybook/angular-vite';
import { LengthSelectComponent } from './length-select.component';

const meta: Meta<LengthSelectComponent> = {
  title: 'Molecules/Length select',
  component: LengthSelectComponent,
  args: { value: 'm', disabled: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<LengthSelectComponent>;

/** Five lengths with their word targets. */
export const Default: Story = {};
/** Locked while a summary is created. */
export const Disabled: Story = { args: { disabled: true } };
