import { google } from "googleapis";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = null;
    this.initialized = false;
  }

  /**
   * Initialize OAuth client
   */
  initialize() {
    if (this.initialized) return;

    console.log("🔧 Initializing Google Calendar Service...");

    if (
      !process.env.GOOGLE_CALENDAR_CLIENT_ID ||
      !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
      !process.env.GOOGLE_CALENDAR_REDIRECT_URI
    ) {
      console.error("❌ Google Calendar credentials missing");
      throw new ApiError(
        500,
        "Google Calendar API credentials are not configured"
      );
    }

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );

    this.initialized = true;
    console.log("✅ Google Calendar Service initialized");
  }

  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /**
   * Generate Google OAuth URL
   */
  getAuthUrl(userId) {
    this.ensureInitialized();

    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: userId,
      prompt: "consent",
    });

    return authUrl;
  }

  /**
   * Exchange auth code for tokens
   */
  async getTokensFromCode(code) {
    this.ensureInitialized();

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error("Error getting tokens:", error);
      throw new ApiError(500, "Failed to get calendar access tokens");
    }
  }

  /**
   * Set OAuth credentials
   */
  setCredentials(tokens) {
    this.ensureInitialized();
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    this.ensureInitialized();

    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw new ApiError(500, "Failed to refresh calendar access token");
    }
  }

  /**
   * Check if token expired
   */
  isTokenExpired(tokens) {
    if (!tokens.expiry_date) return false;

    return Date.now() >= tokens.expiry_date - 5 * 60 * 1000;
  }

  /**
   * Create Calendar Event
   */
  async createEvent(userId, eventData) {
    this.ensureInitialized();

    try {
      const user = await User.findById(userId).select("googleCalendarTokens");

      if (!user?.googleCalendarTokens?.access_token) {
        throw new ApiError(
          401,
          "Calendar not connected. Please authorize access."
        );
      }

      let tokens = user.googleCalendarTokens;

      if (this.isTokenExpired(tokens)) {
        tokens = await this.refreshAccessToken(tokens.refresh_token);
        user.googleCalendarTokens = tokens;
        await user.save();
      }

      this.setCredentials(tokens);

      const calendar = google.calendar({
        version: "v3",
        auth: this.oauth2Client,
      });

      /**
       * Convert date + time → ISO datetime
       */
      const startDateTime = new Date(
        `${eventData.date}T${eventData.startTime}`
      );

      const endDateTime = new Date(
        `${eventData.date}T${eventData.endTime}`
      );

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

      console.log("📅 [GoogleCalendarService] Event created in Google Calendar:", response.data.htmlLink);

      // DB save is handled by calendar.service.js — not here.
      // This service is responsible ONLY for talking to Google Calendar API.
      return response.data;

    } catch (error) {
      console.error("Error creating calendar event:", error);

      if (error instanceof ApiError) throw error;

      throw new ApiError(500, "Failed to create calendar event");
    }
  }

  /**
   * Fetch events
   */
  async getEvents(userId, startDate, endDate) {
    this.ensureInitialized();

    try {
      const user = await User.findById(userId).select("googleCalendarTokens");

      if (!user?.googleCalendarTokens?.access_token) {
        throw new ApiError(
          401,
          "Calendar not connected. Please authorize access."
        );
      }

      let tokens = user.googleCalendarTokens;

      if (this.isTokenExpired(tokens)) {
        tokens = await this.refreshAccessToken(tokens.refresh_token);
        user.googleCalendarTokens = tokens;
        await user.save();
      }

      this.setCredentials(tokens);

      const calendar = google.calendar({
        version: "v3",
        auth: this.oauth2Client,
      });

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      return response.data.items || [];
    } catch (error) {
      console.error("Error fetching calendar events:", error);

      if (error instanceof ApiError) throw error;

      throw new ApiError(500, "Failed to fetch calendar events");
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(userId, eventId) {
    this.ensureInitialized();

    try {
      const user = await User.findById(userId).select("googleCalendarTokens");

      if (!user?.googleCalendarTokens?.access_token) {
        throw new ApiError(
          401,
          "Calendar not connected. Please authorize access."
        );
      }

      this.setCredentials(user.googleCalendarTokens);

      const calendar = google.calendar({
        version: "v3",
        auth: this.oauth2Client,
      });

      await calendar.events.delete({
        calendarId: "primary",
        eventId,
      });

      return { success: true };
    } catch (error) {
      console.error("Error deleting event:", error);
      throw new ApiError(500, "Failed to delete calendar event");
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();