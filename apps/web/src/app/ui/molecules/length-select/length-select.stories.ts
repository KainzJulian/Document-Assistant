import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
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
/** All five options show their target; choosing one marks only that one. */
export const Choose: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('radio')).toHaveLength(5);
    await expect(canvas.getByRole('radio', { name: /Mittel/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(canvas.getByRole('radio', { name: /Extra lang/ }));
    await expect(canvas.getByRole('radio', { name: /Extra lang/ })).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByRole('radio', { name: /Mittel/ })).toHaveAttribute('aria-checked', 'false');
    await expect(canvas.getByText('1200 Wörter')).toBeVisible();
  },
};
/** Locked while a summary is created. */
export const Disabled: Story = { args: { disabled: true } };
