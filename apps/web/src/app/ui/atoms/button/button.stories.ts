import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ButtonComponent } from './button.component';

const meta: Meta<ButtonComponent> = {
  title: 'Atoms/Button',
  component: ButtonComponent,
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading" [block]="block">Speichern</app-button>`,
  }),
  args: { variant: 'secondary', size: 'md', disabled: false, loading: false, block: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ButtonComponent>;

/** Main action of a screen. */
export const Primary: Story = { args: { variant: 'primary' } };
/** Alternative action next to a primary one. */
export const Secondary: Story = {};
/** Low-emphasis text action. */
export const Quiet: Story = { args: { variant: 'quiet' } };
/** Destructive action. */
export const Danger: Story = { args: { variant: 'danger' } };
/** Waiting for the server. */
export const Loading: Story = { args: { variant: 'primary', loading: true } };
/** Not available right now. */
export const Disabled: Story = { args: { variant: 'primary', disabled: true } };
/** Small height for tables and lists. */
export const Small: Story = { args: { variant: 'secondary', size: 'sm' } };
