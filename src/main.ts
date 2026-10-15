import "./style.css";
import { createPromptApiEngine } from "./engines/prompt-api";
import { createTransformersEngine } from "./engines/transformers";
import {
  DEFAULT_TRANSFORMER_PRESET,
  TRANSFORMER_PRESETS,
  transformerPreset,
} from "./engines/transformers-models";
import {
  SYSTEM_PROMPT,
  errorMessage,
  type ChatMessage,
  type EngineCheck,
  type EngineId,
  type LocalEngine,
} from "./engines/types";
import { createWebLLMEngine } from "./engines/webllm";
import {
  DEFAULT_WEBLLM_PRESET,
  WEBLLM_PRESETS,
  webllmPreset,
} from "./engines/webllm-models";

const MODEL_NOTES: Record<Exclude<EngineId, "transformers" | "webllm">, string> = {
  "prompt-api": "Gemini Nano · more than 4 GB VRAM, or 16 GB RAM · download size set by Chrome",
};

const webllm = createWebLLMEngine();
const transformers = createTransformersEngine();
const engines = [
  webllm,
  transformers,
  createPromptApiEngine(),
];

const checks = new Map<EngineId, EngineCheck>();
const transcript: ChatMessage[] = [];

let selected: EngineId = "webllm";
let selectedWebLLM = DEFAULT_WEBLLM_PRESET;
let selectedPreset = DEFAULT_TRANSFORMER_PRESET;
let loadedId: EngineId | null = null;
let loadedWebLLM: string | null = null;
let loadedPreset: string | null = null;
let phase: "idle" | "load" | "generate" | "unload" = "idle";

const statusEl = document.querySelector<HTMLElement>("#status");
const modelEl = document.querySelector<HTMLElement>("#model");
const emptyEl = document.querySelector<HTMLElement>("#empty");
const transcriptEl = document.querySelector<HTMLOListElement>("#transcript");
const webllmField = document.querySelector<HTMLElement>("#webllm-field");
const webllmEl = document.querySelector<HTMLSelectElement>("#webllm-model");
const weightsField = document.querySelector<HTMLElement>("#weights-field");
const weightsEl = document.querySelector<HTMLSelectElement>("#weights");
const loadBtn = document.querySelector<HTMLButtonElement>("#load");
const sendBtn = document.querySelector<HTMLButtonElement>("#send");
const inputEl = document.querySelector<HTMLTextAreaElement>("#input");
const formEl = document.querySelector<HTMLFormElement>("#composer");
const radios = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="engine"]'),
];

if (
  !statusEl ||
  !modelEl ||
  !emptyEl ||
  !transcriptEl ||
  !webllmField ||
  !webllmEl ||
  !weightsField ||
  !weightsEl ||
  !loadBtn ||
  !sendBtn ||
  !inputEl ||
  !formEl
) {
  throw new Error("Demo page is missing an expected element.");
}

for (const preset of WEBLLM_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  option.selected = preset.id === selectedWebLLM;
  webllmEl.append(option);
}
webllm.setModel(selectedWebLLM);

for (const preset of TRANSFORMER_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  option.selected = preset.id === selectedPreset;
  weightsEl.append(option);
}
transformers.setPreset(selectedPreset);
paintModel();

for (const radio of radios) {
  radio.addEventListener("change", () => {
    if (!radio.checked || phase !== "idle") {
      syncRadios();
      return;
    }
    const next = radio.value as EngineId;
    if (next === selected) return;
    selected = next;
    paintModel();
    void switchEngine();
  });
}

webllmEl.addEventListener("change", () => {
  void switchWebLLM();
});

weightsEl.addEventListener("change", () => {
  void switchPreset();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("button.info")) {
  button.addEventListener("click", () => {
    const panelId = button.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
  });
}

loadBtn.addEventListener("click", () => {
  void loadSelected();
});

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage();
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
});

void refreshChecks();
paint();

async function refreshChecks() {
  await Promise.all(
    engines.map(async (engine) => {
      try {
        checks.set(engine.id, await engine.check());
      } catch (error) {
        checks.set(engine.id, { ok: false, detail: errorMessage(error) });
      }
      if (phase === "idle" && engine.id === selected && loadedId !== selected) {
        const check = checks.get(selected);
        if (check) setStatus(idleStatus());
      }
      paintChecks();
      paint();
    }),
  );
}

async function switchWebLLM() {
  const next = webllmEl!.value;
  if (phase !== "idle") {
    webllmEl!.value = selectedWebLLM;
    return;
  }
  if (next === selectedWebLLM) return;

  const leavingLoaded = loadedId === "webllm" && loadedWebLLM === selectedWebLLM;
  selectedWebLLM = next;
  webllm.setModel(next);
  paintModel();
  clearChat();

  if (!leavingLoaded) {
    setStatus(idleStatus());
    paint();
    return;
  }

  loadedId = null;
  loadedWebLLM = null;
  phase = "unload";
  paint();
  setStatus("Unloading the previous runtime…");
  try {
    await webllm.unload();
    setStatus(idleStatus());
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    phase = "idle";
    paint();
  }
}

async function switchPreset() {
  const next = weightsEl!.value;
  if (phase !== "idle") {
    weightsEl!.value = selectedPreset;
    return;
  }
  if (next === selectedPreset) return;

  const leavingLoaded = loadedId === "transformers" && loadedPreset === selectedPreset;
  selectedPreset = next;
  transformers.setPreset(next);
  paintModel();
  clearChat();

  if (!leavingLoaded) {
    setStatus(idleStatus());
    paint();
    return;
  }

  loadedId = null;
  loadedPreset = null;
  phase = "unload";
  paint();
  setStatus("Unloading the previous runtime…");
  try {
    await transformers.unload();
    setStatus(idleStatus());
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    phase = "idle";
    paint();
  }
}

async function switchEngine() {
  clearChat();
  paint();
  if (!loadedId || loadedId === selected) {
    setStatus(idleStatus());
    return;
  }

  const previous = engineById(loadedId);
  loadedId = null;
  loadedWebLLM = null;
  loadedPreset = null;
  phase = "unload";
  paint();
  setStatus("Unloading the previous runtime…");
  try {
    await previous.unload();
    setStatus(idleStatus());
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    phase = "idle";
    paint();
  }
}

async function loadSelected() {
  if (phase !== "idle" || isLoadedSelection()) return;
  const engine = engineById(selected);
  const check = checks.get(engine.id);
  if (check && !check.ok) return;

  phase = "load";
  paint();
  setStatus("Starting load…");
  try {
    if (loadedId && loadedId !== engine.id) {
      await engineById(loadedId).unload();
      loadedId = null;
    }
    await engine.load((text) => setStatus(text));
    loadedId = engine.id;
    loadedWebLLM = engine.id === "webllm" ? selectedWebLLM : null;
    loadedPreset = engine.id === "transformers" ? selectedPreset : null;
    setStatus("Ready. This tab keeps the model until you switch runtimes.");
  } catch (error) {
    loadedId = null;
    loadedWebLLM = null;
    loadedPreset = null;
    await engine.unload().catch(() => {});
    setStatus(errorMessage(error));
  } finally {
    phase = "idle";
    paint();
  }
}

async function sendMessage() {
  if (phase !== "idle" || !isLoadedSelection()) return;
  const text = inputEl!.value.trim();
  if (!text) return;

  inputEl!.value = "";
  const history: ChatMessage[] = [...transcript, { role: "user", content: text }];
  transcript.splice(0, transcript.length, ...history);
  const reply: ChatMessage = { role: "assistant", content: "" };
  transcript.push(reply);
  paintTranscript();

  phase = "generate";
  paint();
  setStatus("Writing…");
  try {
    await engineById(selected).generate(
      [{ role: "system", content: SYSTEM_PROMPT }, ...history],
      (token) => {
        reply.content += token;
        paintTranscript();
      },
    );
    if (!reply.content.trim()) reply.content = "(No text returned.)";
    setStatus("Ready.");
  } catch (error) {
    const message = errorMessage(error);
    reply.content = reply.content
      ? `${reply.content}\n\n${message}`
      : message;
    setStatus(message);
  } finally {
    phase = "idle";
    paintTranscript();
    paint();
    inputEl!.focus();
  }
}

function clearChat() {
  transcript.splice(0, transcript.length);
  if (inputEl) inputEl.value = "";
  paintTranscript();
}

function idleStatus(): string {
  const check = checks.get(selected);
  if (check && !check.ok) return check.detail;
  return "Load this runtime to chat.";
}

function engineById(id: EngineId): LocalEngine {
  const engine = engines.find((candidate) => candidate.id === id);
  if (!engine) throw new Error(`Unknown runtime: ${id}`);
  return engine;
}

function isLoadedSelection(): boolean {
  if (loadedId !== selected) return false;
  if (selected === "webllm" && loadedWebLLM !== selectedWebLLM) return false;
  if (selected === "transformers" && loadedPreset !== selectedPreset) return false;
  return true;
}

function paint() {
  const check = checks.get(selected);
  const loadedHere = isLoadedSelection();
  loadBtn!.disabled =
    phase !== "idle" || loadedHere || (check ? !check.ok : true);
  loadBtn!.textContent =
    phase === "load" ? "Loading…" : loadedHere ? "Loaded" : "Load";
  sendBtn!.disabled = phase !== "idle" || !loadedHere;
  sendBtn!.textContent = phase === "generate" ? "Writing…" : "Send";
  inputEl!.disabled = phase === "load" || phase === "unload";

  for (const radio of radios) {
    radio.disabled = phase !== "idle";
  }
  webllmField!.hidden = selected !== "webllm";
  webllmEl!.disabled = phase !== "idle";
  weightsField!.hidden = selected !== "transformers";
  weightsEl!.disabled = phase !== "idle";
  syncRadios();
  paintChecks();
  paintSteps();
}

function paintSteps() {
  const check = checks.get(selected);
  const loadedHere = isLoadedSelection();
  const current = check && !check.ok ? "pick" : loadedHere ? "chat" : "load";
  const order = ["pick", "load", "chat"] as const;
  const currentIndex = order.indexOf(current);

  for (const [index, id] of order.entries()) {
    const step = document.querySelector<HTMLElement>(`#step-${id}`);
    if (!step) continue;
    const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "waiting";
    step.dataset.state = state;
    if (state === "current") step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }
}

function syncRadios() {
  for (const radio of radios) {
    radio.checked = radio.value === selected;
  }
}

function paintChecks() {
  for (const engine of engines) {
    const node = document.querySelector<HTMLElement>(
      `[data-check="${engine.id}"]`,
    );
    const check = checks.get(engine.id);
    if (!node || !check) continue;
    node.dataset.ok = String(check.ok);
    node.textContent = check.detail;
  }
}

function paintTranscript() {
  const hasMessages = transcript.length > 0;
  emptyEl!.hidden = hasMessages;
  transcriptEl!.hidden = !hasMessages;
  transcriptEl!.replaceChildren();

  for (const message of transcript) {
    if (message.role === "system") continue;
    const item = document.createElement("li");
    item.dataset.role = message.role;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = message.role === "user" ? "You" : "Model";
    const body = document.createElement("p");
    body.textContent = message.content;
    item.append(who, body);
    transcriptEl!.append(item);
  }

  const thread = transcriptEl!.closest(".thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function paintModel() {
  if (selected === "webllm") {
    const preset = webllmPreset(selectedWebLLM);
    modelEl!.textContent = `${preset.progressLabel} Instruct · q4f16 · WebGPU worker`;
    return;
  }
  if (selected === "transformers") {
    const preset = transformerPreset(selectedPreset);
    modelEl!.textContent = `${preset.progressLabel} Instruct · ${preset.dtype} · WebGPU or WASM`;
    return;
  }
  modelEl!.textContent = MODEL_NOTES[selected];
}

function setStatus(text: string) {
  statusEl!.textContent = text;
}
