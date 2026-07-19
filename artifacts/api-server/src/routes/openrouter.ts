import { Router } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";

const router = Router();

router.post("/openrouter/chat", async (req, res) => {
  try {
    const { model, messages, stream = false, maxTokens } = req.body;

    if (stream) {
      // Streaming response
      const streamResponse = await openrouter.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens ?? 4096,
        stream: true,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      for await (const chunk of streamResponse) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          res.write(
            `data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`,
          );
        }
        if (chunk.choices[0]?.finish_reason) {
          res.write(
            `data: ${JSON.stringify({ type: "done", finishReason: chunk.choices[0].finish_reason })}\n\n`,
          );
        }
      }
      res.end();
    } else {
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens ?? 4096,
        stream: false,
      });
      res.json({
        content: response.choices[0]?.message?.content ?? "",
        model: response.model,
        usage: response.usage,
      });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "OpenRouter request failed" });
  }
});

export default router;
