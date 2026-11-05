import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ChatListComponent } from './chat-list.component';

const chat = (id: string, title: string): { id: string; title: string; created_at: string; updated_at: string; snippet: null; message_id: null } => ({
  id,
  title,
  created_at: '2026-11-04T10:00:00Z',
  updated_at: '2026-11-04T10:00:00Z',
  snippet: null,
  message_id: null,
});

const meta: Meta<ChatListComponent> = {
  title: 'Organisms/Chat list',
  component: ChatListComponent,
  args: {
    activeId: 'c1',
    query: '',
    results: null,
    groups: [
      { name: 'Heute', chats: [chat('c1', 'Kündigungsfrist Mietvertrag'), chat('c2', 'Jahresbericht zusammengefasst')] },
      { name: 'Gestern', chats: [chat('c3', 'Garantie Geschirrspüler')] },
      { name: 'Älter', chats: [chat('c4', 'Italienisch Lernplan')] },
    ],
  },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<ChatListComponent>;

/** Chats grouped by date; the open chat is highlighted. */
export const Default: Story = {};
/** No chats yet. */
export const Empty: Story = { args: { groups: [] } };
/** Search results with a highlighted snippet. */
export const Searching: Story = {
  args: {
    query: 'Zusamenfassung',
    results: [{ ...chat('c2', 'Jahresbericht zusammengefasst'), snippet: '…bitte gib mir eine [[Zusammenfassung]] des Jahresberichts…', message_id: null }],
  },
};
