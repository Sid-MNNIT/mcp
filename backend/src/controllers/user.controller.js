import { User } from "../models/user.model.js";
import { Email } from "../models/email.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";   


// Generate tokens helper
const generateAccessAndRefreshTokens = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};


//REGISTER

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, email, password ,age} = req.body;

  if (!fullname || !email || !password||!age) {
  return res.status(400).json({
    success: false,
    message: "All fields are required",
  });
}

if (age && age < 13) {
  return res.status(400).json({
    success: false,
    message: "Age must be 13 or above",
  });
}



  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
  return res.status(409).json({
    success: false,
    message: "User already exists",
  });
}

  const user = await User.create({
    fullname: fullname.trim(),
    email: email.trim().toLowerCase(),
    password,
    age,
     provider: "local", 
  });

  const safeUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res.status(201).json({
    success: true,
    message: "User registered successfully",
    user: safeUser,
  });
});

//LOGIN

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

if (!email || !password) {
  return res.status(400).json({
    success: false,
    message: "Email and password are required",
  });
}


  const user = await User.findOne({ email: email.toLowerCase() });

 if (!user) {
  return res.status(401).json({ success: false, message: "Invalid credentials" });
}

if (user.provider !== "local") {
  return res.status(400).json({ success: false, message: "Please login using Google" });
}

if (!(await user.isPasswordCorrect(password))) {
  return res.status(401).json({ success: false, message: "Invalid credentials" });
}



  user.lastLogin = new Date();
await user.save({ validateBeforeSave: false });


  const tokens = await generateAccessAndRefreshTokens(user._id);

if (!tokens) {
  return res.status(500).json({
    success: false,
    message: "Token generation failed",
  });
}

const { accessToken, refreshToken } = tokens;


  const safeUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
     sameSite: "strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json({
      success: true,
      message: "Login successful",
      user: safeUser,
    });
});

//LOGOUT 

const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  await User.findByIdAndUpdate(userId, {
    $unset: { refreshToken: "" },
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
     sameSite: "strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json({
      success: true,
      message: "Logged out successfully",
    });
});

//REFRESH TOKEN 

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
  return res.status(401).json({
    success: false,
    message: "Refresh token missing",
  });
}

 let decoded;
try {
  decoded = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );
} catch (err) {
  return res.status(401).json({
    success: false,
    message: "Invalid refresh token",
  });
}


  const user = await User.findById(decoded._id);

  if (!user || user.refreshToken !== incomingRefreshToken) {
  return res.status(401).json({
    success: false,
    message: "Invalid refresh token",
  });
}

  const tokens = await generateAccessAndRefreshTokens(user._id);

if (!tokens) {
  return res.status(500).json({
    success: false,
    message: "Token generation failed",
  });
}

const { accessToken, refreshToken } = tokens;


  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
     sameSite: "strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json({
      success: true,
      message: "Access token refreshed",
    });
});

//CURRENT USER 

const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

return res.status(200).json({
  success: true,
  user: {
    _id: req.user._id,
    email: req.user.email,
    fullname: req.user.fullname,
    isGmailConnected: req.user.isGmailConnected,
  }
});


});

const gmailStatus=asyncHandler(async (req,res)=>{
  const user=await User.findById(req.user._id).select(
    "isGmailConnected updatedAt email"
  )
  return res.json({
    connected:user.isGmailConnected,
    lastSync:user.updatedAt,
    gmailEmail: user.isGmailConnected ? user.email : null,
  })
})



export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  gmailStatus
};