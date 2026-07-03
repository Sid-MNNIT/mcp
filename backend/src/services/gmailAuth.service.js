import { google } from "googleapis";
import { OAuthToken } from "../models/oauth_token.model.js";
import { User } from "../models/user.model.js";

/**
 * Refresh a Gmail access token proactively — 5 minutes before it expires —
 * so requests never race a mid-flight expiry.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export class GmailReauthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "GmailReauthRequiredError";
    this.statusCode = 401;
  }
}

function createOAuthClient() {
  const { GOOGLE_SYNC_ID, GOOGLE_SYNC_SECRET, GOOGLE_SYNC_URI } = process.env;
  if (!GOOGLE_SYNC_ID || !GOOGLE_SYNC_SECRET || !GOOGLE_SYNC_URI) {
    throw new Error("Google Gmail OAuth env vars missing");
  }
  return new google.auth.OAuth2(
    GOOGLE_SYNC_ID,
    GOOGLE_SYNC_SECRET,
    GOOGLE_SYNC_URI
  );
}

function isExpired(tokenDoc) {
  // No expiry recorded → treat as stale so we go through the refresh path
  // (which will fail fast if there's no refresh_token either).
  if (!tokenDoc.expiryDate) return true;
  const expiryMs = tokenDoc.expiryDate.getTime
    ? tokenDoc.expiryDate.getTime()
    : new Date(tokenDoc.expiryDate).getTime();
  return expiryMs < Date.now() + REFRESH_SKEW_MS;
}

/**
 * Returns a valid Gmail access token for `userId`, refreshing if needed.
 *
 * Throws `GmailReauthRequiredError` when:
 *   - user hasn't connected Gmail
 *   - the stored refresh_token is missing
 *   - Google rejects the refresh (revoked / invalid_grant)
 *
 * Preserves the refresh_token across refresh cycles — Google usually
 * doesn't return a new one, and blindly overwriting is what breaks
 * long-lived integrations.
 */
export async function getFreshGmailAccessToken(userId) {
  const tokenDoc = await OAuthToken.findOne({
    userId,
    provider: "google",
  });

  if (!tokenDoc) {
    throw new GmailReauthRequiredError("Gmail not connected");
  }

  // Fast path — token still valid.
  if (!isExpired(tokenDoc)) {
    return tokenDoc.accessToken;
  }

  if (!tokenDoc.refreshToken) {
    // Mark user as disconnected so the UI reflects it immediately.
    await User.findByIdAndUpdate(userId, { isGmailConnected: false });
    throw new GmailReauthRequiredError(
      "No refresh token on file — user must re-authorise Gmail"
    );
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: tokenDoc.refreshToken });

  let credentials;
  try {
    ({ credentials } = await oauth2Client.refreshAccessToken());
  } catch (err) {
    const msg = err?.response?.data?.error_description || err.message || "";
    if (
      msg.includes("invalid_grant") ||
      msg.includes("Token has been expired or revoked")
    ) {
      await User.findByIdAndUpdate(userId, { isGmailConnected: false });
    }
    throw new GmailReauthRequiredError(`Gmail token refresh failed: ${msg}`);
  }

  tokenDoc.accessToken = credentials.access_token;
  tokenDoc.expiryDate = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : null;
  // Google only returns a new refresh_token when it rotates one — keep
  // the existing value otherwise so future refreshes still work.
  if (credentials.refresh_token) {
    tokenDoc.refreshToken = credentials.refresh_token;
  }
  if (credentials.scope) {
    tokenDoc.scopes = credentials.scope.split(" ");
  }
  await tokenDoc.save();

  return tokenDoc.accessToken;
}
