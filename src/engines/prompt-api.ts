import {
  errorMessage,
  type ChatMessage,
  type LocalEngine,
} from "./types";

const sessionOptions = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

type Availability = "unavailable" | "downloadable" | "downloading" | "available";

type LanguageSession = {
  promptStreaming(input: string): ReadableStream<string> | AsyncIterable<string>;
  destroy?: () => void;
};

type LanguageModelAPI = {
  availability(options: typeof sessionOptions): Promise<Availability>;
  create(options: typeof sessionOptions & {
    initialPrompts?: ChatMessage[];
    monitor?: (monitor: EventTarget) => void;
  }): Promise<LanguageSession>;
};

function languageModel(): LanguageModelAPI | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelAPI }).LanguageModel;
  if (!candidate || typeof candidate.availability !== "function") return null;
  return candidate;
}

export function createPromptApiEngine(): LocalEngine {
  let ready = false;

  return {
    id: "prompt-api",
    label: "Chrome Prompt API",

    async check() {
      const model = languageModel();
      if (!model) {
        return {
          ok: false,
          detail: "LanguageModel is missing. Desktop Chrome 148+ or Edge is required.",
        };
      }

      try {
        const availability = await model.availability(sessionOptions);
        if (availability === "unavailable") {
          return {
            ok: false,
            detail: "Gemini Nano cannot run on this device.",
          };
        }
        return {
          ok: true,
          detail:
            availability === "available"
              ? "Gemini Nano is already installed."
              : "Gemini Nano will download when you load this runtime.",
        };
      } catch (error) {
        return { ok: false, detail: errorMessage(error) };
      }
    },

    async load(onProgress) {
      const model = languageModel();
      if (!model) {
        throw new Error("LanguageModel is not available in this browser.");
      }

      const availability = await model.availability(sessionOptions);
      if (availability === "unavailable") {
        throw new Error("Gemini Nano cannot run on this device.");
      }

      onProgress(
        availability === "available"
          ? "Opening Gemini Nano…"
          : "Downloading Gemini Nano…",
      );

      const session = await model.create({
        ...sessionOptions,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            const loaded = (event as Event & { loaded?: number }).loaded;
            if (typeof loaded !== "number") return;
            onProgress(`Downloading Gemini Nano… ${Math.round(loaded * 100)}%`);
          });
        },
      });
      session.destroy?.();
      ready = true;
    },

    async generate(messages, onToken) {
      if (!ready) throw new Error("Load the Prompt API before sending.");
      const model = languageModel();
      if (!model) throw new Error("LanguageModel is not available in this browser.");

      const prior = messages.slice(0, -1);
      const latest = messages.at(-1);
      if (!latest || latest.role !== "user") {
        throw new Error("The Prompt API needs a user message to answer.");
      }

      const session = await model.create({
        ...sessionOptions,
        initialPrompts: prior,
      });

      try {
        await readPromptStream(session.promptStreaming(latest.content), onToken);
      } finally {
        session.destroy?.();
      }
    },

    async unload() {
      ready = false;
    },
  };
}

async function readPromptStream(
  stream: ReadableStream<string> | AsyncIterable<string>,
  onToken: (token: string) => void,
) {
  let previous = "";
  const emit = (value: string) => {
    if (!value) return;
    if (value.startsWith(previous)) {
      const delta = value.slice(previous.length);
      previous = value;
      if (delta) onToken(delta);
      return;
    }
    previous += value;
    onToken(value);
  };

  if (isReadableStream(stream)) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (typeof value === "string") emit(value);
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  for await (const value of stream) {
    if (typeof value === "string") emit(value);
  }
}

function isReadableStream(
  stream: ReadableStream<string> | AsyncIterable<string>,
): stream is ReadableStream<string> {
  return typeof (stream as ReadableStream<string>).getReader === "function";
}
