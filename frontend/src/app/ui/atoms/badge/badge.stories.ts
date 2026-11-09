import type { Meta, StoryObj } from '@storybook/angular-vite';
import { BadgeComponent } from './badge.component';

const meta: Meta<BadgeComponent> = {
  title: 'Atoms/Badge',
  component: BadgeComponent,
  render: (args) => ({ props: args, template: `<app-badge [tone]="tone">Nur CPU</app-badge>` }),
  args: { tone: 'neutral' },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<BadgeComponent>;

/** Neutral information, e.g. "Mitglied". */
export const Neutral: Story = {};
/** Positive state. */
export const Success: Story = { args: { tone: 'success' } };
/** Needs attention. */
export const Warning: Story = { args: { tone: 'warning' } };
/** Problem. */
export const Danger: Story = { args: { tone: 'danger' } };
