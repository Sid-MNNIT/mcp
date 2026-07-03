/**
 * Calendar Service
 * ----------------
 * Flow:
 *  1. Read INTERVIEW email from MongoDB
 *  2. Groq LLM extracts date, time, company, meetLink from email body
 *  3. Save event to MongoDB CalendarEvent collection (app calendar)
 *  4. ALSO push event to user's real Google Calendar (notifications on phone/Google)
 *     - Only if user has connected Google Calendar
 *     - Non-fatal if Google Calendar push fails — DB event still saved
 *  5. Mark email as calendarEventCreated: true
 */

import Groq from "groq-sdk";
import { Email } from "../models/email.model.js";
import { CalendarEvent } from "../models/calendarEvent.model.js";
import { googleCalendarService } from "./googleCalendar.service.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { sseService } from "./sse.service.js";

// Groq client — lazy initialized so dotenv has time to load
let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set in backend/.env");
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

class CalendarService {

  /**
   * Extract interview details from email text using Groq LLM.
   * Returns structured data or null if no date/time found.
   */
  async extractDetailsFromEmail(subject, text) {
    const prompt = `
You are an AI assistant that extracts calendar event details from interview invitation emails.

Extract the following from the email:
1. Company name
2. Job role/position
3. Interview date (format: YYYY-MM-DD)
4. Interview start time (format: HH:MM in 24-hour)
5. Interview end time (format: HH:MM in 24-hour, estimate 1 hour if not specified)
6. Meeting link (Google Meet, Zoom, Teams, etc.)
7. Timezone (default "Asia/Kolkata" if not specified)
8. Brief description

Return STRICT JSON only (no markdown, no explanation):
{
  "company": "Company Name",
  "role": "Job Title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "meetLink": "https://...",
  "timezone": "Asia/Kolkata",
  "description": "Brief summary"
}

Defaults if not found:
- role: "Interview"
- endTime: 1 hour after startTime
- timezone: "Asia/Kolkata"
- description: use the subject line
- meetLink: "" (empty string)

If NO date or time is present in the email, return exactly: null

Email Subject: ${subject}
Email Body: ${text}
`.trim();

    // Retry up to 3 times on rate limit (429)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await getGroq().chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 400,
        });

        const raw = response.choices[0].message.content.trim();
        console.log(`🤖 [CalendarService] LLM raw: ${raw}`);

        if (raw === "null" || raw.toLowerCase() === "null") {
          return null;
        }

        const cleaned = raw.startsWith("```")
          ? raw.replace(/```json|```/g, "").trim()
          : raw;

        const result = JSON.parse(cleaned);

        if (!result.date || !result.startTime || !result.endTime || !result.company) {
          console.log("⚠️ [CalendarService] Missing required fields — skipping");
          return null;
        }

        return result;

      } catch (err) {
        const is429 = err.message?.includes("429") || err.status === 429;

        if (is429 && attempt < 3) {
          const waitMs = attempt * 5000; // 5s, 10s
          console.warn(`⏳ [CalendarService] Rate limited — waiting ${waitMs/1000}s before retry ${attempt + 1}/3`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        console.error("❌ [CalendarService] LLM extraction failed:", err.message);
        return null;
      }
    }

    return null;
  }

  /**
   * Main method called by the cron job.
   *
   * Steps:
   *  1. Fetch INTERVIEW email from MongoDB
   *  2. Groq LLM extracts date/time/company
   *  3. Save to MongoDB CalendarEvent
   *  4. Push to user's Google Calendar (if connected) — non-fatal if fails
   *  5. Mark email as calendarEventCreated: true
   */
  async createCalendarEventFromEmail(userId, emailId) {
    console.log(`📅 [CalendarService] Processing email: ${emailId}`);

    // 1. Fetch email from MongoDB
    const email = await Email.findOne({ _id: emailId, userId });

    if (!email) throw new ApiError(404, "Email not found");

    if (email.calendarEventCreated) {
      return { success: true, message: "Already processed" };
    }

    if (email.type !== "INTERVIEW") {
      throw new ApiError(400, `Email type is ${email.type}, not INTERVIEW`);
    }

    if (!email.subject || !email.text) {
      throw new ApiError(400, "Email has no subject or body");
    }

    // 2. Groq LLM extracts event details from email body
    const details = await this.extractDetailsFromEmail(email.subject, email.text);

    if (!details) {
      await Email.findByIdAndUpdate(emailId, { calendarEventCreated: true });
      throw new ApiError(422, "No date/time found in email");
    }

    const eventData = {
      summary:     `${details.company} Interview`,
      description: details.description || email.subject,
      company:     details.company,
      role:        details.role     || "Interview",
      date:        details.date,
      startTime:   details.startTime,
      endTime:     details.endTime,
      timezone:    details.timezone || "Asia/Kolkata",
      meetLink:    details.meetLink || "",
      emailId:     email._id,
    };

    // 3. Save to MongoDB CalendarEvent collection first
    //    Deduplicate by userId + company + date to prevent duplicate events
    //    from multiple emails about the same interview
    const eventDoc = await CalendarEvent.findOneAndUpdate(
      {
        userId,
        $or: [
          { emailId: email._id },
          { company: details.company, date: new Date(`${details.date}T${details.startTime}`) }
        ]
      },
      {
        userId,
        emailId:       email._id,
        googleEventId: null,      // will be updated if Google push succeeds
        summary:       eventData.summary,
        description:   eventData.description,
        company:       eventData.company,
        role:          eventData.role,
        date:          new Date(`${details.date}T${details.startTime}`),
        startTime:     details.startTime,
        endTime:       details.endTime,
        timezone:      details.timezone || "Asia/Kolkata",
        meetLink:      details.meetLink || "",
        eventLink:     "",        // will be updated if Google push succeeds
        source:        "email",
        deletedByUser: false,
      },
      { upsert: true, new: true }
    );

    console.log(`💾 [CalendarService] Saved to MongoDB: ${eventDoc._id}`);

    // Notify frontend immediately via SSE — no manual refresh needed
    sseService.emit(String(userId), "calendar-updated", {
      eventId: String(eventDoc._id),
      company: details.company,
      date:    details.date,
    });

    // 4. Push to user's actual Google Calendar (so their phone/Google gets notifications)
    //    Non-fatal — if Google Calendar isn't connected or push fails,
    //    the event still exists in our app's calendar
    const user = await User.findById(userId).select("googleCalendarTokens");

    if (user?.googleCalendarTokens?.access_token) {
      try {
        const googleEvent = await googleCalendarService.createEvent(userId, eventData);

        // Update the CalendarEvent doc with Google's event ID and link
        await CalendarEvent.findByIdAndUpdate(eventDoc._id, {
          googleEventId: googleEvent.id,
          eventLink:     googleEvent.htmlLink || "",
        });

        console.log(`📅 [CalendarService] Also pushed to Google Calendar: ${googleEvent.htmlLink}`);

      } catch (googleErr) {
        // Google Calendar push failed — not fatal, app calendar still works
        console.warn(`⚠️ [CalendarService] Google Calendar push failed (non-fatal): ${googleErr.message}`);
        console.warn(`   Event is saved in app DB and will still show in the app calendar.`);
      }
    } else {
      console.log(`ℹ️ [CalendarService] Google Calendar not connected for user ${userId} — saved to app only`);
    }

    // 5. Mark email as processed so cron never touches it again
    await Email.findByIdAndUpdate(emailId, { calendarEventCreated: true });

    return {
      success:  true,
      eventId:  eventDoc._id,
      company:  details.company,
      date:     details.date,
      time:     details.startTime,
    };
  }
}

export const calendarService = new CalendarService();