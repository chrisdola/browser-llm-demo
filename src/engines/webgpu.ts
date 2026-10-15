type GpuNavigator = Navigator & {
  gpu?: { requestAdapter(): Promise<unknown> };
};

export async function detectWebGPU(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (!gpu) {
    return { ok: false, detail: "This browser has no WebGPU." };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        ok: false,
        detail: "WebGPU is present, but no adapter is available.",
      };
    }
    return { ok: true, detail: "WebGPU adapter ready." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "WebGPU check failed.";
    return { ok: false, detail };
  }
}
