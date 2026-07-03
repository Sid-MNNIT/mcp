import { Router } from "express";
import { google } from "googleapis";
import { OAuthToken } from "../models/oauth_token.model.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {User} from "../models/user.model.js"

const router = Router();

/**
 * Create OAuth client safely at runtime
 */
function createOAuthClient() {
  const {
    GOOGLE_SYNC_ID,
    GOOGLE_SYNC_SECRET,
    GOOGLE_SYNC_URI,
  } = process.env;

  if (!GOOGLE_SYNC_ID || !GOOGLE_SYNC_SECRET || !GOOGLE_SYNC_URI) {
    throw new Error("Google OAuth env vars missing");
  }

  return new google.auth.OAuth2(
    GOOGLE_SYNC_ID,
    GOOGLE_SYNC_SECRET,
    GOOGLE_SYNC_URI
  );
}

/**
 * STEP 1: User initiates Gmail OAuth
 */
router.get("/gmail", verifyJWT, (req, res) => {
  try {
    const oauth2Client = createOAuthClient();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.modify"],
      prompt: "consent",
      state: req.user._id.toString(), // user binding
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error("Gmail OAuth init error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate Gmail OAuth",
    });
  }
});

/**
 * STEP 2: Google redirects back here
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: "Invalid OAuth callback",
      });
    }

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    await OAuthToken.findOneAndUpdate(
      {
        userId: state,
        provider: "google",
      },
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scopes: tokens.scope?.split(" "),
      },
      { upsert: true, new: true }
    );
    await User.findByIdAndUpdate(
      state,{isGmailConnected:true}
    )

    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to complete Gmail OAuth",
    });
  }
});

router.delete("/disconnect", verifyJWT, async (req, res) => {
  try {
    const userId = req.user._id;

    const tokenDoc = await OAuthToken.findOne({ userId, provider: "google" });

    // Attempt to revoke the token with Google
    if (tokenDoc?.accessToken) {
      try {
        const oauth2Client = createOAuthClient();
        oauth2Client.setCredentials({ access_token: tokenDoc.accessToken });
        await oauth2Client.revokeCredentials();
      } catch (revokeErr) {
        console.warn("Token revoke warning:", revokeErr.message);
      }
    }

    // Remove stored OAuth tokens
    await OAuthToken.findOneAndDelete({ userId, provider: "google" });

    // Mark user as disconnected
    await User.findByIdAndUpdate(userId, { isGmailConnected: false });

    return res.status(200).json({
      success: true,
      message: "Gmail disconnected successfully",
    });
  } catch (err) {
    console.error("Gmail disconnect error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to disconnect Gmail" });
  }
});


export default router;
