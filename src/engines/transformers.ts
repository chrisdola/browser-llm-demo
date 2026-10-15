import {
  DEFAULT_TRANSFORMER_PRESET,
  transformerPreset,
} from "./transformers-models";
import {
  errorMessage,
  type ChatMessage,
  type LocalEngine,
} from "./types";
import { detectWebGPU } from "./webgpu";

type Device = "webgpu" | "wasm";

type InMessage =
  | { type: "load"; device: Device; presetId: string }
  | { type: "generate"; messages: ChatMessage[] }
  | { type: "unload" };

export type TransformersEngine = LocalEngine & {
  setPreset(id: string): void;
};

type OutMessage =
  | { type: "progress"; text: string }
  | { type: "ready"; device: Device }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "unloaded" }
  | { type: "error"; message: string };

type Pending = {
  onProgress?: (text: string) => void;
  onToken?: (token: string) => void;
  resolve: () => void;
  reject: (error: Error) => void;
};

export function createTransformersEngine(): TransformersEngine {
  let worker: Worker | null = null;
  let pending: Pending | null = null;
  let device: Device = "wasm";
  let presetId = DEFAULT_TRANSFORMER_PRESET;

  function rejectPending(error: Error) {
    const current = pending;
    pending = null;
    current?.reject(error);
  }

  function attach(next: Worker) {
    next.onmessage = (event: MessageEvent<OutMessage>) => {
      const message = event.data;
      if (!pending) return;
      if (message.type === "progress") {
        pending.onProgress?.(message.text);
        return;
      }
      if (message.type === "token") {
        pending.onToken?.(message.text);
        return;
      }
      if (message.type === "ready" || message.type === "done" || message.type === "unloaded") {
        const current = pending;
        pending = null;
        current.resolve();
        return;
      }
      rejectPending(new Error(message.message));
    };
    next.onerror = (event) => {
      rejectPending(new Error(event.message || "Transformers.js worker failed."));
    };
  }

  function request(message: InMessage, handlers: Omit<Pending, "resolve" | "reject">) {
    if (!worker) return Promise.reject(new Error("Transformers.js worker is not running."));
    if (pending) return Promise.reject(new Error("Transformers.js is already busy."));

    return new Promise<void>((resolve, reject) => {
      pending = { ...handlers, resolve, reject };
      worker?.postMessage(message);
    });
  }

  return {
    id: "transformers",
    label: "Transformers.js",

    setPreset(id) {
      presetId = transformerPreset(id).id;
    },

    async check() {
      const gpu = await detectWebGPU();
      device = gpu.ok ? "webgpu" : "wasm";
      return {
        ok: true,
        detail: gpu.ok
          ? "Will use WebGPU, and fall back to WASM if that fails."
          : "No WebGPU adapter. This runtime will use WASM.",
      };
    },

    async load(onProgress) {
      await this.unload();
      const gpu = await detectWebGPU();
      device = gpu.ok ? "webgpu" : "wasm";
      const next = new Worker(
        new URL("../workers/transformers.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker = next;
      attach(next);
      try {
        await request({ type: "load", device, presetId }, { onProgress });
      } catch (error) {
        next.terminate();
        worker = null;
        pending = null;
        throw new Error(errorMessage(error));
      }
    },

    async generate(messages, onToken) {
      await request({ type: "generate", messages }, { onToken });
    },

    async unload() {
      const current = worker;
      worker = null;
      if (!current) return;

      if (pending) {
        rejectPending(new Error("Transformers.js was unloaded."));
      }

      try {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(() => {
            resolve();
          }, 4000);
          current.onmessage = (event: MessageEvent<OutMessage>) => {
            if (event.data.type === "unloaded" || event.data.type === "error") {
              window.clearTimeout(timer);
              resolve();
            }
          };
          current.postMessage({ type: "unload" } satisfies InMessage);
        });
      } catch {
        // Termination below releases the runtime either way.
      }
      current.terminate();
    },
  };
}
