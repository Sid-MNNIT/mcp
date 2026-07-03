import { OAuth2Client } from "google-auth-library";
import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
  return res.status(400).json({
    success: false,
    message: "Google idToken is required",
  });
}


  /*Verify token with Google */
 let payload;
try {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  payload = ticket.getPayload();
} catch (err) {
  return res.status(401).json({
    success: false,
    message: "Invalid Google token",
  });
}

  const {
    sub: googleId,
    email,
    name,
    picture,
    email_verified,
  } = payload;

   if (!email) {
      return res
        .status(400)
        .json({ message: "Google did not return an email" });
    }

    if (email_verified === false) {
      return res
        .status(400)
        .json({ message: "Google email is not verified" });
    }

  /*Find or create user */
  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });

  if (!user) {
    user = await User.create({
      email: email.toLowerCase(),
      fullname: name,
      avatar: picture,
      provider: "google",
      googleId,
      isProfileComplete: false,
    });
  } else {
    // Link Google account if needed
    if (!user.googleId) {
      user.googleId = googleId;
      user.provider = "google";
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
      await user.save();
    }
  }

  /*Generate YOUR JWTs */
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  /*Send cookies */
  // Cross-origin in production (Vercel frontend + Render backend) requires
  // sameSite:"none" + secure:true; strict works only when both share an origin.
  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "strict",
  };

  return res
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .status(200)
    .json({
      success: true,
      message: "Google login successful",
      user: {
        _id: user._id,
        email: user.email,
        fullname: user.fullname,
        avatar: user.avatar,
        provider: user.provider,
        isProfileComplete: user.isProfileComplete,
      },
    });
});

export { googleLogin };
