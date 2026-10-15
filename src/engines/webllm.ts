import { CreateWebWorkerMLCEngine, type MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  MAX_NEW_TOKENS,
  errorMessage,
  type ChatMessage,
  type LocalEngine,
} from "./types";
import { DEFAULT_WEBLLM_PRESET, webllmPreset } from "./webllm-models";
import { detectWebGPU } from "./webgpu";

export type WebLLMEngine = LocalEngine & {
  setModel(id: string): void;
};

export function createWebLLMEngine(): WebLLMEngine {
  let engine: MLCEngineInterface | null = null;
  let worker: Worker | null = null;
  let modelId = webllmPreset(DEFAULT_WEBLLM_PRESET).modelId;

  return {
    id: "webllm",
    label: "WebLLM",

    setModel(id) {
      modelId = webllmPreset(id).modelId;
    },

    async check() {
      const gpu = await detectWebGPU();
      if (!gpu.ok) {
        return {
          ok: false,
          detail: `${gpu.detail} WebLLM needs WebGPU.`,
        };
      }
      return { ok: true, detail: "WebGPU adapter ready." };
    },

    async load(onProgress) {
      await this.unload();
      const nextWorker = new Worker(
        new URL("../workers/webllm.worker.ts", import.meta.url),
        { type: "module" },
      );

      try {
        const nextEngine = await CreateWebWorkerMLCEngine(nextWorker, modelId, {
          initProgressCallback: (report) => {
            onProgress(report.text || "Loading WebLLM…");
          },
        });
        engine = nextEngine;
        worker = nextWorker;
      } catch (error) {
        nextWorker.terminate();
        throw new Error(errorMessage(error));
      }
    },

    async generate(messages, onToken) {
      if (!engine) {
        throw new Error("Load WebLLM before sending.");
      }

      const stream = await engine.chat.completions.create({
        messages: messages.map(toWebLLMMessage),
        max_tokens: MAX_NEW_TOKENS,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) onToken(delta);
      }
    },

    async unload() {
      const currentEngine = engine;
      const currentWorker = worker;
      engine = null;
      worker = null;
      if (!currentEngine && !currentWorker) return;

      try {
        currentEngine?.interruptGenerate();
        await currentEngine?.unload();
      } catch {
        // The worker can already be gone when the tab drops the runtime.
      }
      currentWorker?.terminate();
    },
  };
}

function toWebLLMMessage(message: ChatMessage) {
  return { role: message.role, content: message.content };
}
