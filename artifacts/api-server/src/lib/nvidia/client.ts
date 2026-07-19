/**
 * NVIDIA NIM client — OpenAI-compatible interface.
 * Uses the same SDK as OpenRouter, just a different base URL.
 */
import OpenAI from "openai";

const apiKey = process.env.NVIDIA_API_KEY;

export const nvidia = apiKey
  ? new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey,
    })
  : null;

export function hasNvidiaConfig() {
  return !!apiKey;
}

export default nvidia;
