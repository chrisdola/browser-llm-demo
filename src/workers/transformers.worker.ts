import {
  env,
  pipeline,
  TextStreamer,
  type ProgressInfo,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

const createGenerator = pipeline as (
  task: "text-generation",
  model: string,
  options: {
    dtype: WeightDtype;
    device: Device;
    session_options: { graphOptimizationLevel: "disabled" };
    progress_callback: (info: ProgressInfo) => void;
  },
) => Promise<TextGenerationPipeline>;
import { MAX_NEW_TOKENS, errorMessage, type ChatMessage } from "../engines/types";
import {
  transformerPreset,
  type WeightDtype,
} from "../engines/transformers-models";

type Device = "webgpu" | "wasm";

type InMessage =
  | { type: "load"; device: Device; presetId: string }
  | { type: "generate"; messages: ChatMessage[] }
  | { type: "unload" };

type OutMessage =
  | { type: "progress"; text: string }
  | { type: "ready"; device: Device }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "unloaded" }
  | { type: "error"; message: string };

env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

let generator: TextGenerationPipeline | null = null;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
  postMessage(message: OutMessage): void;
};

scope.onmessage = (event) => {
  void handle(event.data);
};

async function handle(message: InMessage) {
  try {
    if (message.type === "load") {
      const device = await load(message.device, message.presetId);
      post({ type: "ready", device });
      return;
    }
    if (message.type === "generate") {
      await generate(message.messages);
      post({ type: "done" });
      return;
    }
    await dispose();
    post({ type: "unloaded" });
  } catch (error) {
    post({ type: "error", message: errorMessage(error) });
  }
}

async function load(preferred: Device, presetId: string): Promise<Device> {
  const preset = transformerPreset(presetId);
  await dispose();
  const attempts: Device[] = preferred === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown;

  for (const device of attempts) {
    try {
      post({
        type: "progress",
        text:
          device === preferred
            ? `Loading ${preset.progressLabel} on ${device}…`
            : `WebGPU failed (${errorMessage(lastError)}). Falling back to WASM…`,
      });
      generator = await createGenerator("text-generation", preset.repo, {
        dtype: preset.dtype,
        device,
        // The default graph optimizer peaks above the browser's 4 GB wasm heap on the larger models.
        session_options: { graphOptimizationLevel: "disabled" },
        progress_callback: (info) => {
          post({ type: "progress", text: formatProgress(info) });
        },
      });
      return device;
    } catch (error) {
      lastError = error;
      await dispose();
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not load the Transformers.js model.");
}

async function generate(messages: ChatMessage[]) {
  if (!generator) throw new Error("Load Transformers.js before sending.");

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      if (text) post({ type: "token", text });
    },
  });

  // The checkpoint sets do_sample, but this runtime never applies its top-k
  // filter, so sampling wanders into a persona and later turns repeat it.
  await generator(messages, {
    max_new_tokens: MAX_NEW_TOKENS,
    do_sample: false,
    streamer,
  });
}

async function dispose() {
  if (!generator) return;
  const current = generator;
  generator = null;
  await current.dispose();
}

function formatProgress(info: ProgressInfo): string {
  if (info.status === "progress") {
    return `${info.file} ${Math.round(info.progress)}%`;
  }
  if (info.status === "ready") return "Weights ready. Starting the runtime…";
  if (info.status === "done") return `${info.file} cached`;
  return `${info.status} ${info.file}`;
}

function post(message: OutMessage) {
  scope.postMessage(message);
}
