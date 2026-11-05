import type { Meta, StoryObj } from '@storybook/angular-vite';
import { OllamaFit } from '../../../core/api';
import { OllamaFitDialogComponent } from './ollama-fit-dialog.component';

const base: OllamaFit = {
  model: 'llama3.1:8b',
  ram_total_gb: 16,
  ram_free_gb: 11.2,
  gpu: null,
  need_gb: 5.9,
  verdict: 'cpu_only',
  est_words_per_s: 3.2,
  needs_warning: true,
  acknowledged: null,
};

const meta: Meta<OllamaFitDialogComponent> = {
  title: 'Organisms/Ollama fit dialog',
  component: OllamaFitDialogComponent,
  args: { open: true, fit: base, measured: null, testing: false },
};
export default meta;
/** Story type of this component. */
type Story = StoryObj<OllamaFitDialogComponent>;

/** No GPU: the model runs on the CPU. */
export const CpuOnly: Story = {};
/** Part of the model runs on a GPU. */
export const PartialGpu: Story = {
  args: { fit: { ...base, verdict: 'partial', gpu: { name: 'GeForce RTX 3060', vram_total_gb: 6, vram_free_gb: 4.5 }, est_words_per_s: 9 } },
};
/** Not enough memory. */
export const TooBig: Story = { args: { fit: { ...base, model: 'qwen2.5:32b', verdict: 'too_big', need_gb: 22.4, est_words_per_s: null } } };
/** After the speed test. */
export const Measured: Story = { args: { measured: 4.1 } };
