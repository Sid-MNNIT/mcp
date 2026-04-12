import { googleCalendarService } from '../services/googleCalendar.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { User } from '../models/user.model.js';
import { CalendarEvent } from '../models/calendarEvent.model.js';
import { calendarService } from '../services/calendar.service.js';

/**
 * Get Google Calendar authorization URL
 * GET /api/calendar/auth-url
 */
export const getCalendarAuthUrl = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const authUrl = googleCalendarService.getAuthUrl(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, { authUrl }, 'Authorization URL generated'));
});

/**
 * Handle OAuth callback and save tokens
 * GET /api/calendar/oauth-callback
 */
export const handleCalendarOAuthCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    throw new ApiError(400, 'Missing authorization code or state');
  }

  const userId = state;

  // Exchange code for tokens
  const tokens = await googleCalendarService.getTokensFromCode(code);

  // Save tokens to user
  await User.findByIdAndUpdate(userId, {
    googleCalendarTokens: tokens,
    isCalendarConnected: true,
  });

  // Redirect to frontend with success
  return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?calendar_connected=true`);
});

/**
 * Get calendar events
 * GET /api/calendar/events?start=ISO_DATE&end=ISO_DATE
 *
 * Strategy:
 *   1. Always query local DB (fast, works offline)
 *   2. If user has calendar connected, also fetch from Google and
 *      upsert any new events so the DB stays in sync
 *   3. Return the merged DB result
 */
export const getCalendarEvents = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { start, end } = req.query;

  if (!start || !end) {
    throw new ApiError(400, 'Start and end dates are required');
  }

  const startDate = new Date(start);
  const endDate   = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ApiError(400, 'Invalid date format');
  }

  // Serve directly from MongoDB CalendarEvent collection.
  // Events are created by the cron job: Gmail → MongoDB Email → Groq LLM → CalendarEvent
  const events = await CalendarEvent.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
    deletedByUser: { $ne: true },
  }).sort({ date: 1 }).lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { events }, 'Calendar events fetched successfully'));
});

/**
 * Get all stored calendar events from DB (no date filter)
 * GET /api/calendar/events/all
 */
export const getAllCalendarEvents = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const events = await CalendarEvent.find({ userId, deletedByUser: { $ne: true } })
    .sort({ date: 1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { events }, 'All calendar events fetched'));
});

/**
 * Delete a calendar event from Google, local DB, AND mark the
 * source email so the cron never recreates it.
 * DELETE /api/calendar/events/:googleEventId
 */
export const deleteCalendarEvent = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { googleEventId } = req.params;

  // Find by either googleEventId or MongoDB _id (events without Google
  // Calendar have googleEventId: null, so we support both)
  const mongoose = await import('mongoose');
  const isMongoId = mongoose.default.Types.ObjectId.isValid(googleEventId);

  const dbEvent = isMongoId
    ? await CalendarEvent.findOne({ userId, _id: googleEventId })
    : await CalendarEvent.findOne({ userId, googleEventId });

  if (!dbEvent) {
    return res.status(404).json(new ApiResponse(404, {}, 'Event not found'));
  }

  // Remove from Google Calendar only if it was pushed there
  if (dbEvent.googleEventId) {
    try {
      await googleCalendarService.deleteEvent(userId, dbEvent.googleEventId);
    } catch (err) {
      console.warn('⚠️  Google delete failed (removing from DB anyway):', err.message);
    }
  }

  // Soft-delete in MongoDB
  await CalendarEvent.findByIdAndUpdate(dbEvent._id, { deletedByUser: true });

  // Mark source email so cron never recreates this event
  if (dbEvent.emailId) {
    const { Email } = await import('../models/email.model.js');
    await Email.findByIdAndUpdate(dbEvent.emailId, {
      calendarEventCreated: true,
      calendarEventDeleted: true,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Event deleted'));
});

/**
 * Check if calendar is connected
 * GET /api/calendar/status
 */
export const getCalendarConnectionStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  const user = await User.findById(userId).select('googleCalendarTokens email');
  const isConnected = !!user?.googleCalendarTokens?.access_token;

  // Extract the connected Google account email from the id_token if available
  let calendarEmail = null;
  if (isConnected && user.googleCalendarTokens?.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(user.googleCalendarTokens.id_token.split('.')[1], 'base64').toString()
      );
      calendarEmail = payload.email || null;
    } catch {}
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { isConnected, calendarEmail }, 'Calendar connection status'));
});

/**
 * Disconnect calendar
 * DELETE /api/calendar/disconnect
 */
export const disconnectCalendar = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  await User.findByIdAndUpdate(userId, {
    $unset: { googleCalendarTokens: "" },
    isCalendarConnected: false,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Calendar disconnected successfully'));
});

export const createCalendarEvent = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const jwt = req.headers.authorization?.replace("Bearer ", "");
  const { emailId } = req.body;

  const result = await calendarService.createCalendarEventFromEmail(userId, emailId, jwt);
  return res.status(200).json(new ApiResponse(200, result, "Event created"));
});