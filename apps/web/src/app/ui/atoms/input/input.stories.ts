import type { Meta, StoryObj } from '@storybook/angular-vite';
import { InputComponent } from './input.component';

const meta: Meta<InputComponent> = {
  title: 'Atoms/Input',
  component: InputComponent,
  args: { label: 'Benutzername', value: '', type: 'text', placeholder: '', hint: '', error: '', disabled: false, required: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<InputComponent>;

/** Plain field with a visible label. */
export const Default: Story = {};
/** Help text under the field. */
export const WithHint: Story = { args: { label: 'Passwort', type: 'password', hint: 'Mindestens 8 Zeichen.' } };
/** Error text replaces the hint and turns the border red. */
export const WithError: Story = { args: { label: 'Passwort', type: 'password', value: 'kurz', error: 'Das Passwort ist zu kurz.' } };
/** Disabled field. */
export const Disabled: Story = { args: { label: 'Chats durchsuchen', type: 'search', placeholder: 'Chats durchsuchen', disabled: true } };
