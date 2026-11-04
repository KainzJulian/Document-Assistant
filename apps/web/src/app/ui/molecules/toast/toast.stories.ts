import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ToastComponent } from './toast.component';

const meta: Meta<ToastComponent> = {
  title: 'Molecules/Toast',
  component: ToastComponent,
  args: { tone: 'success', message: 'Benutzer angelegt.' },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ToastComponent>;

/** Confirmation. */
export const Success: Story = {};
/** Error message from the server. */
export const Danger: Story = { args: { tone: 'danger', message: 'Zu viele Fehlversuche. Bitte versuche es in 15 Minuten erneut.' } };
