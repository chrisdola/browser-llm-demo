# Browser LLM demo

A simple demo of in-browser LLM usage to show howcase different methods and see how model size would impact chat load times. 

## Runtimes

All three engines share the same chat and the same system prompt: answer the latest question directly, in a few sentences. They differ in who owns the weights, which hardware they can use, and how much of generation this page can control.

### WebLLM

[WebLLM](https://webllm.mlc.ai/) runs models that MLC has already compiled into WebGPU chat kernels. A web worker owns the engine, so generation stays off the UI thread. Replies stream through an OpenAI-style chat API at temperature 0.7 and stop at 512 new tokens.

The model menu is all `q4f16`. The sizes below are GPU memory for the weights plus a 4,096-token context, from the package's prebuilt catalog:


| Model                  | GPU memory   |
| ---------------------- | ------------ |
| SmolLM2 360M (default) | about 380 MB |
| Llama 3.2 1B           | about 880 MB |
| Qwen2.5 1.5B           | about 1.6 GB |
| SmolLM2 1.7B           | about 1.8 GB |
| Llama 3.2 3B           | about 2.3 GB |
| Qwen2.5 3B             | about 2.5 GB |


**Strengths.** The kernels are built for chat, so a loaded model is usually the fastest of the two shipped runtimes. The worker keeps the page responsive while tokens stream. Weights stay in the browser cache after the first Load.

**Limits.** WebGPU is required. A machine without an adapter cannot load this runtime, and there is no CPU fallback. The menu can only offer models this version of WebLLM already ships. SmolLM2 also needs `shader-f16`. The 3B options need a laptop GPU that can spare about 2.5 GB. These sizes are still small instruct models, suited to a short answer or a rewrite.

### Transformers.js

[Transformers.js](https://huggingface.co/docs/transformers.js) runs ONNX weights through ONNX Runtime. A second web worker owns the pipeline. It tries WebGPU when an adapter exists and falls back to WASM on the CPU when WebGPU is missing or the GPU session fails. The first Load fetches the chosen repo from Hugging Face into the cache. Tokens stream from the tokenizer and stop at 512 new tokens.

The weight menu:


| Weights                                 | Download     |
| --------------------------------------- | ------------ |
| Qwen2.5 0.5B Instruct `q4`              | about 750 MB |
| Qwen2.5 1.5B Instruct `q4f16` (default) | about 1.2 GB |
| SmolLM2 1.7B Instruct `q4`              | about 1.4 GB |


**Strengths.** It still runs when WebGPU is unavailable, which is the reason to pick it over WebLLM on a machine with no adapter. The same chat can compare a Qwen or SmolLM checkpoint here with the WebLLM build of a similar size. This demo only generates text.

**Limits.** WASM is slower, and the browser's WASM heap is 4 GB. The default ONNX graph optimizer peaks over that heap on the larger weights, so every preset loads with graph optimization disabled. Generation is greedy (`do_sample: false`). The Qwen checkpoints ask for sampling, but this runtime does not apply their top-k filter, and sampling wandered into a repeated persona. The 0.5B weight is the most likely to invent details.

### Chrome Prompt API

The [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) calls Gemini Nano through `LanguageModel` on the main thread. Desktop Chrome 148+ and Edge expose it. This page ships no weights and cannot choose the checkpoint or the quantization. Load checks availability and, when Chrome still needs the model, downloads the browser's copy. Replies come from `promptStreaming()`. Each send opens a fresh session with the earlier messages as the initial prompt.

**Strengths.** Chrome downloads Gemini Nano on the first Load and keeps that copy for later visits, including on other sites. This page does not host the file, and Chrome updates it after it is installed. When Nano is already on the machine, Load is the short path of the three.

**Limits.** `LanguageModel` has to exist. In this demo that means desktop Chrome 148+ or Edge; other browsers leave Load disabled, and the other two runtimes still work. The device also has to be able to run Gemini Nano, which Chrome reports as unavailable on some hardware. The web API exposes no sampling controls and no token cap, so length is left to the shared system prompt. The session in this demo expects English text in and English text out. Quality and context size are whatever the browser installed, and this page cannot swap in another model.



## Run

```sh
npm install
npm run dev
```

Open the local URL Vite prints. Download starts only after you choose a runtime and click Load. Switching runtimes, or choosing a different WebLLM model or Transformers.js weight, unloads the previous model and clears the chat. One model stays loaded at a time.





> [!NOTE]   
> `file://` will not work. The dev server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so ONNX Runtime can use threaded WASM.