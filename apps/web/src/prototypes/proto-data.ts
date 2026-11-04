/** Colour meaning of a status or verdict. */
export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Processing state of a document. */
export type DocStatus = 'ready' | 'reading' | 'indexing' | 'queued' | 'failed';

/** A library document (mock). */
export interface ProtoDoc {
  id: string;
  title: string;
  type: 'PDF' | 'DOCX' | 'PPTX' | 'URL' | 'EPUB';
  meta: string;
  size: string;
  added: string;
  status: DocStatus;
  shared: boolean;
  error?: string;
}

/** Chip look per status. */
export const STATUS: Record<DocStatus, { label: string; tone: ChipTone; busy: boolean }> = {
  ready: { label: 'Bereit', tone: 'success', busy: false },
  reading: { label: 'Wird gelesen', tone: 'info', busy: true },
  indexing: { label: 'Wird indexiert', tone: 'info', busy: true },
  queued: { label: 'Wartet', tone: 'neutral', busy: false },
  failed: { label: 'Fehler', tone: 'danger', busy: false },
};

/** Mock library. */
export const DOCS: ProtoDoc[] = [
  { id: 'd1', title: 'Mietvertrag Wohnung Linz', type: 'PDF', meta: '12 Seiten', size: '2,4 MB', added: 'Heute', status: 'ready', shared: false },
  { id: 'd2', title: 'Jahresbericht 2025 Energie AG', type: 'PDF', meta: '84 Seiten', size: '9,1 MB', added: 'Heute', status: 'ready', shared: true },
  { id: 'd3', title: 'Garantiebedingungen Geschirrspüler', type: 'DOCX', meta: '6 Seiten', size: '310 KB', added: 'Gestern', status: 'ready', shared: true },
  { id: 'd4', title: 'Photovoltaik (Wikipedia)', type: 'URL', meta: 'de.wikipedia.org', size: '48 KB', added: 'Vor 3 Tagen', status: 'ready', shared: false },
  { id: 'd5', title: 'Kursunterlagen Italienisch A2', type: 'PPTX', meta: '36 Folien', size: '5,7 MB', added: 'Vor 3 Tagen', status: 'indexing', shared: false },
  { id: 'd6', title: 'Steuerbescheid 2024', type: 'PDF', meta: '4 Seiten', size: '820 KB', added: 'Vor 5 Tagen', status: 'reading', shared: false },
  { id: 'd7', title: 'Bedienungsanleitung Heizung', type: 'EPUB', meta: '58 Seiten', size: '3,3 MB', added: 'Vor 6 Tagen', status: 'queued', shared: true },
  { id: 'd8', title: 'Kaufvertrag Sofa (Scan)', type: 'PDF', meta: '2 Seiten', size: '1,9 MB', added: 'Letzte Woche', status: 'failed', shared: false, error: 'Gescannte PDFs werden nicht unterstützt' },
];

/** A chat in the sidebar (mock). */
export interface ProtoChat {
  id: string;
  title: string;
  group: 'Heute' | 'Gestern' | 'Letzte 7 Tage' | 'Älter';
}

/** Mock chat history. */
export const CHATS: ProtoChat[] = [
  { id: 'c1', title: 'Kündigungsfrist Mietvertrag', group: 'Heute' },
  { id: 'c2', title: 'Jahresbericht zusammengefasst', group: 'Heute' },
  { id: 'c3', title: 'Garantie Geschirrspüler', group: 'Gestern' },
  { id: 'c4', title: 'Photovoltaik: Amortisation', group: 'Letzte 7 Tage' },
  { id: 'c5', title: 'Italienisch Lernplan', group: 'Älter' },
];

/** Citation passage shown in the side panel or under the answer. */
export interface ProtoCitation {
  n: number;
  docTitle: string;
  page: string;
  section: string;
  text: string;
}

/** Mock citations of the conversation. */
export const CITATIONS: ProtoCitation[] = [
  {
    n: 1,
    docTitle: 'Mietvertrag Wohnung Linz',
    page: 'S. 4',
    section: '§ 7 Kündigung',
    text: 'Der Mieter kann das Mietverhältnis unter Einhaltung einer Frist von drei Monaten zum Monatsletzten schriftlich kündigen. Maßgeblich ist der Zugang beim Vermieter.',
  },
  {
    n: 2,
    docTitle: 'Mietvertrag Wohnung Linz',
    page: 'S. 5',
    section: '§ 8 Verkauf der Wohnung',
    text: 'Wird die Wohnung veräußert, bleibt das Mietverhältnis bestehen. Eine vorzeitige Auflösung ist nur mit schriftlicher Zustimmung beider Parteien möglich.',
  },
];

/** One piece of an assistant answer: text or a citation marker. */
export type AnswerPart = { t: 'text'; v: string } | { t: 'cite'; n: number };

/** A chat message (mock). */
export interface ProtoMessage {
  role: 'user' | 'assistant';
  text?: string;
  parts?: AnswerPart[];
  notFound?: boolean;
}

/** Mock conversation. */
export const MESSAGES: ProtoMessage[] = [
  { role: 'user', text: 'Wie lange ist die Kündigungsfrist im Mietvertrag, und gibt es Ausnahmen?' },
  {
    role: 'assistant',
    parts: [
      { t: 'text', v: 'Du kannst den Mietvertrag mit einer Frist von drei Monaten zum Monatsletzten schriftlich kündigen' },
      { t: 'cite', n: 1 },
      { t: 'text', v: '. Maßgeblich ist, wann die Kündigung beim Vermieter eingeht. Eine vorzeitige Auflösung ist nur möglich, wenn beide Parteien schriftlich zustimmen, zum Beispiel nach einem Verkauf der Wohnung' },
      { t: 'cite', n: 2 },
      { t: 'text', v: '.' },
    ],
  },
  { role: 'user', text: 'Und wie hoch ist die Kaution?' },
  {
    role: 'assistant',
    notFound: true,
    parts: [{ t: 'text', v: 'Dazu finde ich in den ausgewählten Dokumenten nichts.' }],
  },
];

/** A selectable AI model in settings (mock). */
export interface ProtoModel {
  id: string;
  group: 'Lokal (Ollama)' | 'Cloud';
  provider: string;
  name: string;
  verdict?: { label: string; tone: ChipTone };
}

/** Mock model list. */
export const MODELS: ProtoModel[] = [
  { id: 'm1', group: 'Lokal (Ollama)', provider: 'Ollama', name: 'llama3.1:8b', verdict: { label: 'Nur CPU', tone: 'warning' } },
  { id: 'm2', group: 'Lokal (Ollama)', provider: 'Ollama', name: 'qwen2.5:14b', verdict: { label: 'Nur CPU', tone: 'warning' } },
  { id: 'm3', group: 'Lokal (Ollama)', provider: 'Ollama', name: 'qwen2.5:32b', verdict: { label: 'Passt nicht', tone: 'danger' } },
  { id: 'm4', group: 'Cloud', provider: 'Anthropic', name: 'Claude Sonnet 5.5' },
  { id: 'm5', group: 'Cloud', provider: 'OpenAI', name: 'GPT' },
  { id: 'm6', group: 'Cloud', provider: 'Google', name: 'Gemini' },
];
