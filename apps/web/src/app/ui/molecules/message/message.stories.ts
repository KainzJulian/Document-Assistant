import type { Meta, StoryObj } from '@storybook/angular-vite';
import { MessageComponent } from './message.component';

const citations = [
  { n: 1, chunk_id: 'c1', document_id: 'd1', document_title: 'Mietvertrag Wohnung Linz', page_from: 4, page_to: 4, section_path: '§ 7 Kündigung' },
  { n: 2, chunk_id: 'c2', document_id: 'd1', document_title: 'Mietvertrag Wohnung Linz', page_from: 5, page_to: 5, section_path: '§ 8 Verkauf' },
];

const meta: Meta<MessageComponent> = {
  title: 'Molecules/Message',
  component: MessageComponent,
  args: { role: 'assistant', messageId: 'm1', content: '', citations: [], streaming: false, interrupted: false, error: '', canRegenerate: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<MessageComponent>;

/** The person's question. */
export const Question: Story = { args: { role: 'user', content: 'Wie lange ist die Kündigungsfrist, und gibt es Ausnahmen?' } };
/** An answer with numbered source chips and Markdown. */
export const Answer: Story = {
  args: {
    citations,
    canRegenerate: true,
    content: 'Du kannst mit **drei Monaten** Frist kündigen [1].\n\nAusnahmen:\n- Verkauf der Wohnung nur mit Zustimmung [2]\n- *wichtige Gründe*',
  },
};
/** Waiting for the first token. */
export const Waiting: Story = { args: { streaming: true } };
/** Text arriving. */
export const Streaming: Story = { args: { streaming: true, content: 'Du kannst mit drei Monaten Frist kün' } };
/** Stopped by the person. */
export const Interrupted: Story = { args: { interrupted: true, content: 'Der Vertrag regelt unter anderem die Miete und' } };
/** The documents have no answer. */
export const NotFound: Story = { args: { content: 'Dazu finde ich in den ausgewählten Dokumenten nichts.' } };
/** The answer failed. */
export const Failed: Story = { args: { error: 'Der API-Schlüssel wurde abgelehnt oder fehlt.' } };
