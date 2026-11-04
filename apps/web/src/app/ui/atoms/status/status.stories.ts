import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StatusComponent } from './status.component';

const meta: Meta<StatusComponent> = {
  title: 'Atoms/Status',
  component: StatusComponent,
  args: { status: 'ready' },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<StatusComponent>;

/** Waiting in the queue. */
export const Queued: Story = { args: { status: 'queued' } };
/** Being read (the dot pulses). */
export const Reading: Story = { args: { status: 'reading' } };
/** Being indexed. */
export const Indexing: Story = { args: { status: 'indexing' } };
/** Done. */
export const Ready: Story = {};
/** Failed; the reason is shown next to it by the page. */
export const Failed: Story = { args: { status: 'failed' } };
