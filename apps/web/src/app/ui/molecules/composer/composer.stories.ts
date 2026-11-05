import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ComposerComponent } from './composer.component';

const meta: Meta<ComposerComponent> = {
  title: 'Molecules/Composer',
  component: ComposerComponent,
  args: { value: '', busy: false, disabled: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ComposerComponent>;

/** Empty question box. */
export const Empty: Story = {};
/** With a typed question. */
export const Typed: Story = { args: { value: 'Wie lange ist die Kündigungsfrist?' } };
/** An answer is streaming: "Stopp" replaces "Senden". */
export const Streaming: Story = { args: { busy: true } };
