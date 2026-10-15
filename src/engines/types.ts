export type EngineId = "webllm" | "transformers" | "prompt-api";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type EngineCheck = {
  ok: boolean;
  detail: string;
};

export interface LocalEngine {
  id: EngineId;
  label: string;
  check(): Promise<EngineCheck>;
  load(onProgress: (text: string) => void): Promise<void>;
  generate(
    messages: ChatMessage[],
    onToken: (token: string) => void,
  ): Promise<void>;
  unload(): Promise<void>;
}

export const SYSTEM_PROMPT =
  "Answer the user's latest question directly, in a few sentences.";

export const MAX_NEW_TOKENS = 512;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
