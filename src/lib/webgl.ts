/**
 * Safe WebGL capability detector and context manager.
 * Prevents WebGL context exhaustion and avoids attempting WebGL instantiation
 * when the browser has blocked WebGL contexts.
 */

let cachedSupport: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedSupport !== null) return cachedSupport;

  try {
    const canvas = document.createElement("canvas");
    const opts: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", opts) ||
      canvas.getContext("webgl", opts) ||
      canvas.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;

    if (!gl) {
      cachedSupport = false;
      return false;
    }

    if (typeof gl.isContextLost === "function" && gl.isContextLost()) {
      cachedSupport = false;
      return false;
    }

    // Immediately release the probe context to avoid holding onto browser context slots
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch {
      /* ignore */
    }

    cachedSupport = true;
    return true;
  } catch {
    cachedSupport = false;
    return false;
  }
}

export function markWebGLFailed(): void {
  cachedSupport = false;
}
