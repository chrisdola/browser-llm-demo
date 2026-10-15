export type WeightDtype = "q4" | "q4f16";

export type TransformerPreset = {
  id: string;
  repo: string;
  dtype: WeightDtype;
  label: string;
  progressLabel: string;
};

export const TRANSFORMER_PRESETS: readonly TransformerPreset[] = [
  {
    id: "qwen-0.5b",
    repo: "onnx-community/Qwen2.5-0.5B-Instruct",
    dtype: "q4",
    label: "Qwen2.5 0.5B · q4 · 750 MB / 850 MB",
    progressLabel: "Qwen2.5 0.5B",
  },
  {
    id: "qwen-1.5b",
    repo: "onnx-community/Qwen2.5-1.5B-Instruct",
    dtype: "q4f16",
    label: "Qwen2.5 1.5B · q4f16 · 1.2 GB / 1.4 GB",
    progressLabel: "Qwen2.5 1.5B",
  },
  {
    id: "smollm2-1.7b",
    repo: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    dtype: "q4",
    label: "SmolLM2 1.7B · q4 · 1.4 GB / 2.8 GB",
    progressLabel: "SmolLM2 1.7B",
  },
];

export const DEFAULT_TRANSFORMER_PRESET = "qwen-1.5b";

export function transformerPreset(id: string): TransformerPreset {
  const preset = TRANSFORMER_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown Transformers.js weight: ${id}`);
  return preset;
}
