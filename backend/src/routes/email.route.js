import { Router } from "express";
import {
  storeEmail,
  listEmails,
  deleteEmail,
  getUserEmail,
  executeAgentTool,
  emailReplyPreview,
  emailReplySend,
  emailSync,
  toggleStarEmail,
  queryEmails,
  checkExistingEmailIds,
  triggerEmailSync,
} from "../controllers/email.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, storeEmail);


router.get("/fetch-email", verifyJWT, getUserEmail);

router.get("/", verifyJWT, listEmails);
router.delete("/:id", verifyJWT, deleteEmail);

router.patch("/:id/star", verifyJWT,toggleStarEmail);

router.post("/query", verifyJWT, queryEmails);
router.post("/exists", verifyJWT, checkExistingEmailIds);
router.post("/sync-trigger", verifyJWT, triggerEmailSync);







router.post(
  "/execute",
  verifyJWT,              
  executeAgentTool
);


router.post(
  "/email-reply-preview",
  verifyJWT,
  emailReplyPreview
);

router.post(
  "/email-reply-send",
  verifyJWT,
  emailReplySend
);

router.post(
  "/email-sync",
  verifyJWT,
  emailSync
)




export default router;
