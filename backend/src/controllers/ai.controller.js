import { executePipeline } from "../services/ai.service.js";
import fetch from "node-fetch";

const ASK_JOBSY_URL = process.env.ASK_JOBSY_URL || "http://localhost:9001";

export async function aiChat(req, res) {
  try {
    const { text, conversation_id, metadata } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ error: "text is required" });
    }


    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!jwt) {
      return res.status(401).json({ error: "JWT missing" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000); // 3 min for heavy pipelines

    const response = await fetch(`${ASK_JOBSY_URL}/ask-jobsy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ text, conversation_id, metadata: metadata || {} }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("❌ aiChat failed:", err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function aiExecute(req, res) {
  try {
    const { endpoint, args } = req.body;

    const userId = req.user._id;
    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    const result = await executePipeline({
      endpoint,
      args,
      userId,
      jwt
    });

    res.json(result);
  } catch (err) {
    console.error("❌ AI execute failed:", err.message);
    res.status(500).json({ error: err.message });
  }
}
