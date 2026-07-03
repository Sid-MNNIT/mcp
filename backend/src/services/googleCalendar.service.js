import { google } from "googleapis";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";

/**
 * Refresh 5 minutes before actual expiry so requests never race a
 * mid-flight token expiration.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

class GoogleCalendarService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    if (
      !process.env.GOOGLE_CALENDAR_CLIENT_ID ||
      !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
      !process.env.GOOGLE_CALENDAR_REDIRECT_URI
    ) {
      throw new ApiError(
        500,
        "Google Calendar API credentials are not configured"
      );
    }

    this.initialized = true;
    console.log("✅ Google Calendar Service initialized");
  }

  ensureInitialized() {
    if (!this.initialized) this.initialize();
  }

  /**
   * Build a fresh OAuth client per call — sharing one across concurrent
   * requests causes credential races when refresh happens.
   */
  _newOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );
  }

  getAuthUrl(userId) {
    this.ensureInitialized();
    const client = this._newOAuthClient();

    // `calendar` is a superset that already grants event read/write.
    // No need to also request `calendar.events` — it's implied.
    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    return client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: userId,
      prompt: "consent",
    });
  }

  async getTokensFromCode(code) {
    this.ensureInitialized();
    const client = this._newOAuthClient();

    try {
      const { tokens } = await client.getToken(code);
      return tokens;
    } catch (error) {
      console.error("[calendar] token exchange failed:", error);
      throw new ApiError(500, "Failed to get calendar access tokens");
    }
  }

  isTokenExpired(tokens) {
    if (!tokens?.expiry_date) return true;
    return Date.now() >= tokens.expiry_date - REFRESH_SKEW_MS;
  }

  /**
   * Refresh an access token using the stored refresh_token.
   * Google typically does NOT return a new refresh_token, so callers
   * MUST merge the response into the existing tokens object (see
   * _refreshAndPersist) rather than replacing it wholesale.
   */
  async refreshAccessToken(refreshToken) {
    this.ensureInitialized();
    if (!refreshToken) {
      throw new ApiError(401, "No refresh token — please reconnect Calendar.");
    }

    const client = this._newOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error("[calendar] refresh failed:", error?.message || error);
      throw new ApiError(
        401,
        "Failed to refresh calendar access token — please reconnect Calendar."
      );
    }
  }

  /**
   * Merges refreshed credentials into the existing tokens object,
   * preserving refresh_token when Google doesn't return a new one.
   * Also persists the update to the User document.
   */
  async _refreshAndPersist(user, tokens) {
    const fresh = await this.refreshAccessToken(tokens.refresh_token);

    const merged = {
      access_token: fresh.access_token || tokens.access_token,
      refresh_token: fresh.refresh_token || tokens.refresh_token, // ← key fix
      expiry_date: fresh.expiry_date || tokens.expiry_date,
      token_type: fresh.token_type || tokens.token_type,
      scope: fresh.scope || tokens.scope,
      id_token: fresh.id_token || tokens.id_token,
    };

    user.googleCalendarTokens = merged;
    await user.save();
    return merged;
  }

  /**
   * Central helper — returns an authenticated OAuth2 client for a user,
   * transparently refreshing the token if it's expired or near-expiry.
   *
   * All Calendar API calls go through this so we never duplicate the
   * refresh/persist logic and never leak the "deleteEvent bypass" bug
   * where a caller forgot the expiry check.
   */
  async _getAuthedClient(userId) {
    this.ensureInitialized();

    const user = await User.findById(userId).select("googleCalendarTokens");
    if (!user?.googleCalendarTokens?.access_token) {
      throw new ApiError(
        401,
        "Calendar not connected. Please authorize access."
      );
    }

    let tokens =
      user.googleCalendarTokens.toObject?.() || { ...user.googleCalendarTokens };

    if (this.isTokenExpired(tokens)) {
      if (!tokens.refresh_token) {
        // Reflect disconnected state so the dashboard status is honest.
        await User.findByIdAndUpdate(userId, { isCalendarConnected: false });
        throw new ApiError(
          401,
          "Calendar refresh token missing — please reconnect Calendar."
        );
      }
      tokens = await this._refreshAndPersist(user, tokens);
    }

    const client = this._newOAuthClient();
    client.setCredentials(tokens);
    return client;
  }

  /**
   * Set OAuth credentials — kept for callers outside this service that
   * do their own token management (they should migrate to _getAuthedClient).
   */
  setCredentials(tokens) {
    // Kept for backward compatibility with any external caller.
    // Prefer routing new code through _getAuthedClient().
    this.ensureInitialized();
    const client = this._newOAuthClient();
    client.setCredentials(tokens);
    return client;
  }

  /**
   * Create Calendar Event
   */
  async createEvent(userId, eventData) {
    try {
      const auth = await this._getAuthedClient(userId);
      const calendar = google.calendar({ version: "v3", auth });

      const startDateTime = new Date(`${eventData.date}T${eventData.startTime}`);
      const endDateTime = new Date(`${eventData.date}T${eventData.endTime}`);

      const event = {
        summary: eventData.summary,
        description: `${eventData.description || ""}

Meeting Link: ${eventData.meetLink || ""}`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: eventData.timezone || "Asia/Kolkata",
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: eventData.timezone || "Asia/Kolkata",
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      };

      const response = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });

      console.log(
        "📅 [GoogleCalendarService] Event created:",
        response.data.htmlLink
      );
      return response.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("[calendar] createEvent failed:", error);
      throw new ApiError(500, "Failed to create calendar event");
    }
  }

  /**
   * Fetch events
   */
  async getEvents(userId, startDate, endDate) {
    try {
      const auth = await this._getAuthedClient(userId);
      const calendar = google.calendar({ version: "v3", auth });

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      return response.data.items || [];
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("[calendar] getEvents failed:", error);
      throw new ApiError(500, "Failed to fetch calendar events");
    }
  }

  /**
   * Delete event — now refreshes the token if needed (the old
   * implementation bypassed the expiry check and would 401 randomly).
   */
  async deleteEvent(userId, eventId) {
    try {
      const auth = await this._getAuthedClient(userId);
      const calendar = google.calendar({ version: "v3", auth });

      await calendar.events.delete({
        calendarId: "primary",
        eventId,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("[calendar] deleteEvent failed:", error);
      throw new ApiError(500, "Failed to delete calendar event");
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
