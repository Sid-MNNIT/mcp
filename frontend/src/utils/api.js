const BASE_URL = "http://localhost:5000/api";

export const signupUser = async (data) => {
  const res = await fetch(`${BASE_URL}/user/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  return res.json();
};

export const loginUser = async (data) => {
  const res = await fetch(`${BASE_URL}/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  return res.json();
};

export const getCurrentUser = async () => {
  const res = await fetch(`${BASE_URL}/user/me`, {
    credentials: "include", 
  });

  return res.json();
};

export const logoutUser = async () => {
  const res = await fetch(`${BASE_URL}/user/logout`, {
    method: "POST",
    credentials: "include", 
  });

  return res.json();
};


export const googleLogin = async (idToken) => {
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });

  return res.json();
};

//jobs api

export const searchJobs = async (filters) => {
  const query = new URLSearchParams(filters).toString();

  const res = await fetch(`${BASE_URL}/jobs/search?${query}`, {
    credentials: "include",
  });

  return res.json();
};

export const getJobCategories = async (country = "in") => {
  const res = await fetch(
    `${BASE_URL}/jobs/categories?country=${country}`,
    {
      credentials: "include",
    }
  );

  return res.json();
};

export const getRecommendedJobs = async () => {
  const res = await fetch(`${BASE_URL}/jobs/recommended`, {
    credentials: "include",
  });

  return res.json();
};

export const saveJob = async (job) => {
  const res = await fetch(`${BASE_URL}/jobs/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(job),
  });

  return res.json();
};

/**
 * Get saved jobs
 */
export const getSavedJobs = async () => {
  const res = await fetch(`${BASE_URL}/jobs/saved`, {
    credentials: "include",
  });

  return res.json();
};

/**
 * Unsave a job
 */
export const unsaveJob = async (jobId) => {
  const res = await fetch(`${BASE_URL}/jobs/saved/${jobId}`, {
    method: "DELETE",
    credentials: "include",
  });

  return res.json();
}
export const startGmailSync = () => {

  window.location.href = "http://localhost:5000/sync/google/gmail";
};

export const rankJobsByRelevance = async (jobs) => {
  const res = await fetch(`${BASE_URL}/jobs/rank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ jobs }),
  });

  return res.json();
};

export const getGmailStatus= async()=>{
  const res=await fetch(`${BASE_URL}/user/gmail-status`,{
    credentials:"include"
  })
  return res.json()
}

export const getEmails= async()=>{
  const res=await fetch(`${BASE_URL}/emails/fetch-email?sent=false`,{
    credentials :"include"
  })
  return res.json();
}

export const getSentEmails = async () => {
  const res = await fetch(
    `${BASE_URL}/emails/fetch-email?sent=true`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch sent emails");
  }

  return res.json();
};



export const getStarredEmails = async () => {
  const res = await fetch(
    `${BASE_URL}/emails/fetch-email?starred=true`,
    { credentials: "include" }
  );

  return res.json();
};

export const deleteEmail=async(emailId) => {
  const res=await fetch(
    `${BASE_URL}/emails/${emailId}`,{
      method:"DELETE",
      credentials:"include"
    }
  );
  if(!res.ok){
    throw new Error("Failed to delete email")
  }

  return res.json();
};


export const toggleStarEmail = async (emailId) => {
  const res = await fetch(`${BASE_URL}/emails/${emailId}/star`, {
    method: "PATCH",
    credentials: "include"
  });

  return res.json();
};







export const generateAiReplyPreview = async ({ messageId, tone }) => {
  const res = await fetch(`${BASE_URL}/emails/email-reply-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      messageId,
      tone
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to generate AI reply");
  }

  const result = await res.json();

  const { draft } = result;

  if (
    !draft ||
    !draft.to ||
    !draft.subject ||
    !draft.body ||
    !draft.threadId ||
    !draft.in_reply_to
  ) {
    console.error("❌ Invalid pipeline response:", result);
    throw new Error("Invalid AI draft returned from pipeline");
  }

  return {
    draft
  };
};


export const sendAiReply = async (draft) => {
  const res = await fetch(`${BASE_URL}/emails/email-reply-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(draft)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to send email");
  }

  return await res.json();
};


export const getEmailStats = async () => {
  const res = await fetch(`${BASE_URL}/emails/fetch-email?sent=false`, {
    credentials: "include",
  });
  const data = await res.json();
  const emails = data.emails || [];

  return {
    interviews: emails.filter(e => e.type === "INTERVIEW").length,
    rejections: emails.filter(e => e.type === "REJECTION").length,
    assessments: emails.filter(e => e.type === "JOB" || e.type === "OTHER").length,
  };
};

export const syncEmails = async () => {
  const res = await fetch(`${BASE_URL}/emails/email-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", 
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to sync emails");
  }

  return await res.json();
};


//profile apis
//Get logged-in user's profile
export const uploadAvatar = async (file) => {
  const formData = new FormData();
  formData.append("avatar", file);

  const res = await fetch(`${BASE_URL}/profile/me/avatar`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to upload avatar");
  return res.json();
};

export const getMyProfile = async () => {
  const res = await fetch(`${BASE_URL}/profile/me`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  const data = await res.json();
  return data.profile;
};

// Update logged-in user's profile
export const updateMyProfile = async (payload) => {
  const res = await fetch(`${BASE_URL}/profile/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Failed to update profile");
  }

  const data = await res.json();
  return data.profile;
};

//skills
export const updateSkills = async (skills) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/skills`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ skills }),
    }
  );

  if (!res.ok) throw new Error("Failed to update skills");
  return res.json();
};

//experience
export const addExperience = async (data) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/experience`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) throw new Error("Failed to add experience");
  return res.json();
};

export const updateExperience = async (id, data) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/experience/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) throw new Error("Failed to update experience");
  return res.json();
};

export const deleteExperience = async (id) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/experience/${id}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!res.ok) throw new Error("Failed to delete experience");
  return res.json();
};
//education
export const addEducation = async (data) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/education`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) throw new Error("Failed to add education");
  return res.json();
};

export const updateEducation = async (id, data) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/education/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) throw new Error("Failed to update education");
  return res.json();
};

export const deleteEducation = async (id) => {
  const res = await fetch(
    `${BASE_URL}/profile/me/education/${id}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!res.ok) throw new Error("Failed to delete education");
  return res.json();
};

// Change password
export const changePassword = async (currentPassword, newPassword) => {
  const res = await fetch(`${BASE_URL}/profile/me/change-password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to change password");
  }

  return res.json();
};
export const disconnectGmail = async () => {
  const res = await fetch(` http://localhost:5000/sync/google/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect Gmail");
  return res.json();
};

export const reconnectGmail = () => {
  window.location.href = "http://localhost:5000/sync/google/gmail";
};

/* ===================================================== */
/* Notification Preferences APIs                         */
/* ===================================================== */

export const getNotificationPrefs = async () => {
  const res = await fetch(`${BASE_URL}/notifications/preferences`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch notification preferences");
  return res.json();
};

export const updateNotificationPrefs = async (prefs) => {
  const res = await fetch(`${BASE_URL}/notifications/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("Failed to update notification preferences");
  return res.json();
};


/* ===================================================== */
/* Resume APIs                                           */
/* ===================================================== */

export const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append("resume", file); // IMPORTANT: must match multer upload.single("resume")

  const res = await fetch(`${BASE_URL}/resume`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Failed to upload resume");
  }

  return res.json();
};

export const getMyResume = async () => {
  const res = await fetch(`${BASE_URL}/resume`, {
    credentials: "include",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Failed to fetch resume");
  }

  return res.json();
};

// URL for opening PDF in a new tab (cookie auth included)
export const getResumeFileUrl = () => `${BASE_URL}/resume/file`;

export const deleteResume = async () => {
  const res = await fetch(`${BASE_URL}/resume`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Failed to delete resume");
  }
  return res.json();
};

/**
 * Re-score the stored parsed_resume with the latest ATS scorer.
 * No file upload needed — uses what’s already in MongoDB.
 */
export const recalculateScore = async () => {
  const res = await fetch(`${BASE_URL}/resume/recalculate`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Failed to recalculate score");
  }

  return res.json();
};


// ── Calendar APIs ──────────────────────────────
export const getCalendarAuthUrl = async () => {
  const res = await fetch(`${BASE_URL}/calendar/auth-url`, {
    credentials: "include",
  });
  const data = await res.json();
  return data.data.authUrl;
};

export const getCalendarConnectionStatus = async () => {
  try {
    const res = await fetch(`${BASE_URL}/calendar/status`, {
      credentials: "include",
    });
    if (!res.ok) return { isConnected: false, calendarEmail: null };
    const data = await res.json();
    return {
      isConnected: data.data.isConnected,
      calendarEmail: data.data.calendarEmail || null,
    };
  } catch {
    return { isConnected: false, calendarEmail: null };
  }
};

export const getCalendarEvents = async (startDate, endDate) => {
  const params = new URLSearchParams({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });
  const res = await fetch(`${BASE_URL}/calendar/events?${params}`, {
    credentials: "include",
  });
  const data = await res.json();
  return data.data.events;
};

export const getAllCalendarEvents = async () => {
  const res = await fetch(`${BASE_URL}/calendar/events/all`, {
    credentials: "include",
  });
  const data = await res.json();
  return data.data.events;
};

export const deleteCalendarEvent = async (eventId) => {
  const res = await fetch(`${BASE_URL}/calendar/events/${eventId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete event");
  return true;
};

export const disconnectCalendar = async () => {
  const res = await fetch(`${BASE_URL}/calendar/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect calendar");
  return true;
};