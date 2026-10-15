export type WebLLMPreset = {
  id: string;
  modelId: string;
  label: string;
  progressLabel: string;
};

export const WEBLLM_PRESETS: readonly WebLLMPreset[] = [
  {
    id: "smollm2-360m",
    modelId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM2 360M · q4f16 · 380 MB GPU",
    progressLabel: "SmolLM2 360M",
  },
  {
    id: "llama-1b",
    modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B · q4f16 · 880 MB GPU",
    progressLabel: "Llama 3.2 1B",
  },
  {
    id: "qwen-1.5b",
    modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B · q4f16 · 1.6 GB GPU",
    progressLabel: "Qwen2.5 1.5B",
  },
  {
    id: "smollm2-1.7b",
    modelId: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    label: "SmolLM2 1.7B · q4f16 · 1.8 GB GPU",
    progressLabel: "SmolLM2 1.7B",
  },
  {
    id: "llama-3b",
    modelId: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B · q4f16 · 2.3 GB GPU",
    progressLabel: "Llama 3.2 3B",
  },
  {
    id: "qwen-3b",
    modelId: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 3B · q4f16 · 2.5 GB GPU",
    progressLabel: "Qwen2.5 3B",
  },
];

export const DEFAULT_WEBLLM_PRESET = "smollm2-360m";

export function webllmPreset(id: string): WebLLMPreset {
  const preset = WEBLLM_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown WebLLM model: ${id}`);
  return preset;
}
