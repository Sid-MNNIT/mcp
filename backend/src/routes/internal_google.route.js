import express from "express";
import { serviceAuth } from "../middleware/service_auth.js";
import {
  getFreshGmailAccessToken,
  GmailReauthRequiredError,
} from "../services/gmailAuth.service.js";

const router = express.Router();

/**
 * Internal endpoint used by the MCP Gmail server to fetch a valid
 * access token for a user. The service handles expiry checks and
 * refresh under the hood — this route is intentionally thin so both
 * the API and the cron ingest share the same code path.
 */
router.post("/gmail/token", serviceAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const accessToken = await getFreshGmailAccessToken(userId);
    return res.json({ accessToken });
  } catch (err) {
    if (err instanceof GmailReauthRequiredError) {
      console.warn(`[internal/gmail/token] ${err.message}`);
      return res.status(401).json({
        error: "Token refresh failed",
        message: err.message,
      });
    }

    console.error("[internal/gmail/token] Unexpected error:", err);
    return res.status(500).json({
      error: "Failed to get Gmail token",
      details: err.message,
    });
  }
});

export default router;
