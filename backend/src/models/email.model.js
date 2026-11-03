import mongoose from "mongoose";

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    emailId: {
      type: String,
      required: true, // Gmail message ID
    },

    provider: {
      type: String,
      enum: ["gmail"],
      default: "gmail",
    },
    isStarred: {
    type: Boolean,
    default: false
  },
    folder: {
  type: String,
  enum: ["INBOX", "SENT"],
  required: true
}, 





    type: {
      type: String,
      enum: ["PENDING", "JOB", "INTERVIEW", "OFFER", "REJECTION", "OTHER"],
      required: true,
    },

    from: {
      type: String,
      required: true,
    },

    subject: {
      type: String,
    },

    text: {
      type: String,
    },

    date: {
      type: Date,
      required: true,
    },
    
    threadId: {
  type: String,
  required: true
},
calendarEventCreated: {
  type: Boolean,
  default: false,
},

calendarEventDeleted: {
  type: Boolean,
  default: false,
},


    isEmbedded: {
      type: Boolean,
      default: false,
    },

    // Soft-delete: user dismissed this email from the UI.
    // Kept as a tombstone so the cron never re-fetches and re-classifies it.
    deletedByUser: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// prevent duplicate storage
emailSchema.index({ userId: 1, emailId: 1 }, { unique: true });

export const Email = mongoose.model("Email", emailSchema);
