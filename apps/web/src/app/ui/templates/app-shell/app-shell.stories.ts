import { provideRouter } from '@angular/router';
import { applicationConfig } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { AppShellComponent } from './app-shell.component';

const meta: Meta<AppShellComponent> = {
  title: 'Templates/App shell',
  component: AppShellComponent,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  parameters: { layout: 'fullscreen' },
  render: (args) => ({
    props: args,
    template: `<app-shell [userName]="userName" [isAdmin]="isAdmin" [dark]="dark"><div class="p-8"><h1 class="text-3xl font-semibold tracking-tight">Seiteninhalt</h1><p class="mt-2 text-muted">Hier erscheint die jeweilige Seite.</p></div></app-shell>`,
  }),
  args: { userName: 'Julian', isAdmin: false, dark: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<AppShellComponent>;

/** Member view. From 1024 px the sidebar is fixed; below it becomes a drawer behind "Menü". */
export const Member: Story = {};
/** Admins also see the "Benutzer" entry. */
export const Admin: Story = { args: { isAdmin: true } };
