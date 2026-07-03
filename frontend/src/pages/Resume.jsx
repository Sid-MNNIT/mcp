import React, { useState, useEffect } from "react";
import Sidebar from "../components/layout/Sidebar";
import TopHeader from "../components/layout/TopHeader";
import { uploadResume, getMyResume, getResumeFileUrl, recalculateScore, deleteResume } from "../utils/api";
import { useAuth } from "../context/AuthContext";

import "../styles/dashboard.css";
import "../styles/resume.css";

import ResumeUpload from "../components/resume/ResumeUpload";
import ATSScore from "../components/resume/ATSScore";
import ResumeMetadata from "../components/resume/ResumeMetadata";

// ─── Delete Confirmation Modal ───────────────────────────────────────────────
function DeleteConfirmModal({ filename, onConfirm, onCancel, isDeleting }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div className="modal-icon modal-icon--danger">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>

        <h2 className="modal-title">Delete Resume?</h2>
        <p className="modal-body">
          <strong>{filename}</strong> will be permanently removed.
          Your score and insights will be cleared. This cannot be undone.
        </p>

        <div className="modal-actions">
          <button
            className="modal-btn modal-btn--cancel"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            className="modal-btn modal-btn--danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Resume() {
  const { user } = useAuth();

  // this is the local file user selects (actual File object)
  const [uploadedFile, setUploadedFile] = useState(null);

  // resume metadata stored in DB
  const [resumeMeta, setResumeMeta] = useState(null);

  const [scoreData, setScoreData] = useState(null);
  const [metadataData, setMetadataData] = useState(null);

  const [isCalculating, setIsCalculating] = useState(false);
  const [isLoadingResume, setIsLoadingResume] = useState(false);

  // keeps a copy of the last successfully saved score so we can restore it
  // when the user selects a new file then cancels (hits Remove)
  const [savedScoreData, setSavedScoreData] = useState(null);
  const [savedMetadataData, setSavedMetadataData] = useState(null);

  // delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting]           = useState(false);

  // User is provided by AuthContext — no redundant /user/me fetch.

  // ----------------------------
  // Load existing resume from backend on page open
  // Auto-recalculates if the stored score is from an old scorer version
  // ----------------------------
  useEffect(() => {
    const loadResume = async () => {
      setIsLoadingResume(true);
      try {
        const res = await getMyResume();
        const payload = res?.data;

        if (!payload?.hasResume) {
          setResumeMeta(null);
          setScoreData(null);
          setMetadataData(null);
          return;
        }

        setResumeMeta(payload.resume || null);

        const score  = payload.score  || null;
        const parsed = payload.parsed_resume || null;

        // pass full parsed_resume so ResumeMetadata has both entities + sections
        if (parsed?.entities) {
          setMetadataData(parsed);
          setSavedMetadataData(parsed);
        } else {
          setMetadataData(null);
          setSavedMetadataData(null);
        }

        // Detect stale score: scorer version is not ats_v3
        // If stale and parsed data exists, silently recalculate in the background
        const scorerVersion = score?.ats?.meta?.scorer;
        const isStaleScore  = scorerVersion !== "ats_v4";

        if (isStaleScore && parsed?.entities) {
          console.log(`🔄 Stale score detected (${scorerVersion ?? "none"}), recalculating with ats_v3...`);
          try {
            const recalcRes     = await recalculateScore();
            const recalcPayload = recalcRes?.data;
            if (recalcPayload?.score?.final_score !== undefined) {
              setScoreData(recalcPayload.score);
            }
          } catch (recalcErr) {
            // recalculation failed — fall back to showing the old score
            console.warn("⚠️ Recalculation failed, showing cached score:", recalcErr.message);
            if (score?.final_score !== undefined) setScoreData(score);
          }
        } else {
          // Score is current — use as-is
          if (score?.final_score !== undefined) {
            setScoreData(score);
            setSavedScoreData(score);
          }
          // back-fill llm_good/llm_improvement/llm_bad for old cached scores
          // that only have llm_feedback so the UI renders gracefully
          // Back-fill: old cached scores stored llm_feedback as plain strings.
          // Wrap them as {text, severity: "yellow"} so the new UI renders them.
          if (score?.llm_feedback?.length && typeof score.llm_feedback[0] === "string") {
            const patched = {
              ...score,
              llm_feedback: score.llm_feedback.map(t => ({ text: t, severity: "yellow" }))
            };
            setScoreData(patched);
            setSavedScoreData(patched);
          }
        }
      } catch (err) {
        console.error("Failed to load resume:", err);
      } finally {
        setIsLoadingResume(false);
      }
    };

    loadResume();
  }, []);

  // ----------------------------
  // File selection — clear score immediately so user sees Calculate button
  // ----------------------------
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return; // user cancelled the picker — do nothing

    const isPdf =
      file.type === "application/pdf" ||
      file.type === "application/octet-stream" || // some browsers/OS send this for PDFs
      file.name.toLowerCase().endsWith(".pdf");   // fallback: trust the extension

    if (isPdf) {
      setUploadedFile(file);
      // Clear score and metadata so ATS + Key Insights reset for the new file
      setScoreData(null);
      setMetadataData(null);
      // Reset the input value so the same file can be re-selected after removal
      e.target.value = "";
    } else {
      alert("Please upload a PDF file");
      e.target.value = "";
    }
  };

  // ----------------------------
  // Upload + parse
  // ----------------------------
  const handleCalculate = async () => {
    if (!uploadedFile) {
      alert("Please upload a resume first!");
      return;
    }

    setIsCalculating(true);

    try {
      const res = await uploadResume(uploadedFile);
      const payload = res?.data;

      if (!payload) throw new Error("Invalid response from backend");

      // store metadata for showing on UI
      setResumeMeta(payload.resume || null);

      // score directly matches ATSScore.jsx expectation
      // only set score if pipeline actually returned a real result
      const newScore = payload.score?.final_score !== undefined ? payload.score : null;
      setScoreData(newScore);
      if (newScore) setSavedScoreData(newScore);

      // pass full parsed_resume so ResumeMetadata has both entities + sections
      const parsed = payload.parsed_resume || {};
      const newMeta = parsed?.entities ? parsed : null;
      setMetadataData(newMeta);
      setSavedMetadataData(newMeta);

      // keep uploadedFile OR clear it - your choice
      // setUploadedFile(null);
    } catch (err) {
      console.error(err);
      alert("Resume upload/parse failed. Check console for details.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    // Restore saved score + metadata — user cancelled, go back to stored state
    if (savedScoreData) setScoreData(savedScoreData);
    if (savedMetadataData) setMetadataData(savedMetadataData);
  };

  // opens the modal
  const handleDeleteResume = () => setShowDeleteModal(true);

  // called when user confirms inside the modal
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteResume();
      setResumeMeta(null);
      setScoreData(null);
      setSavedScoreData(null);
      setMetadataData(null);
      setSavedMetadataData(null);
      setUploadedFile(null);
      setShowDeleteModal(false);
    } catch (err) {
      console.error("Failed to delete resume:", err);
      // show error inside modal by just closing — user can retry
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenResume = () => {
    window.open(getResumeFileUrl(), "_blank");
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="dashboard-root">
        <TopHeader
          fullName={user?.fullname || "User"}
          title="Resume Analysis"
          hideGreeting
        />

        {/* 3-column grid — always locked */}
        <div className="resume-container">
          <ResumeUpload
            uploadedFile={uploadedFile}
            resumeMeta={resumeMeta}
            isLoadingResume={isLoadingResume}
            onUpload={handleFileUpload}
            onRemove={handleRemoveFile}
            onOpenResume={handleOpenResume}
            onDelete={handleDeleteResume}
          />

          <ATSScore
            scoreData={scoreData}
            uploadedFile={uploadedFile}
            isCalculating={isCalculating}
            isLoadingResume={isLoadingResume}
            onCalculate={handleCalculate}
          />

          <ResumeMetadata metadataData={metadataData} />
        </div>
      </main>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          filename={resumeMeta?.filename}
          onConfirm={handleConfirmDelete}
          onCancel={() => !isDeleting && setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}