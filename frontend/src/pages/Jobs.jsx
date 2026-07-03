import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../styles/jobs.css";

import Sidebar from "../components/layout/Sidebar";
import TopHeader from "../components/layout/TopHeader";
import JobFilters from "../components/jobs/JobFilters";
import JobFeed from "../components/jobs/JobFeed";
import JobDetails from "../components/jobs/JobDetails";

import {
  searchJobs,
  getRecommendedJobs,
  saveJob,
  unsaveJob,
  getSavedJobs,
  rankJobsByRelevance,
} from "../utils/api";
import { useAuth } from "../context/AuthContext";

const Jobs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [viewMode, setViewMode] = useState("search");

  const [filters, setFilters] = useState({
    keywords: searchParams.get("keywords") || "",
    location: searchParams.get("location") || "",
    category: "",
    jobType: "full_time",
    minSalary: "",
    maxSalary: "",
    sortBy: "relevance",
  });

  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedJobIds, setSavedJobIds] = useState(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState(false);

  useEffect(() => {
    // User comes from AuthContext — no per-page /user/me fetch needed.
    loadSavedJobIds();

    if (searchParams.get("keywords")) {
      handleSearchJobs();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && showJobDetails) {
        handleCloseDetails();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showJobDetails]);

  // ✅ ADD THIS ENTIRE useEffect BLOCK
  useEffect(() => {
    const handleSortChange = async () => {
      if (filters.sortBy === 'relevance' && jobs.length > 0 && user /*&& viewMode === 'search'*/) {
        setLoading(true);
        setError(null);
        try {
          const response = await rankJobsByRelevance(jobs);
          if (response.success && response.data?.jobs) {
            setJobs(response.data.jobs);
          }
        } catch (error) {
          console.error("Failed to rank jobs:", error);
          setError("Failed to sort by relevance. Please try again.");
        } finally {
          setLoading(false);
        }
      }
    };

    handleSortChange();
  }, [filters.sortBy]); // Trigger when sortBy changes

  const loadSavedJobIds = async () => {
    try {
      const response = await getSavedJobs();
      if (response.success && response.data?.jobs) {
        const ids = new Set(response.data.jobs.map((job) => job.id));
        setSavedJobIds(ids);
      }
    } catch (err) {
      console.error("Failed to load saved jobs:", err);
    }
  };

  const handleFetchSavedJobsForView = async () => {
    setLoading(true);
    setError(null);
    setSelectedJob(null);
    setShowJobDetails(false);
    try {
      const response = await getSavedJobs();
      if (response.success && response.data?.jobs) {
        setJobs(response.data.jobs);
      } else {
        setJobs([]);
      }
    } catch (err) {
      setError("Failed to load saved jobs.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchJobs = async () => {
    setLoading(true);
    setError(null);
    setSelectedJob(null);
    setShowJobDetails(false);

    setSearchParams({
      keywords: filters.keywords,
      ...(filters.location && { location: filters.location }),
    });

    try {
      const response = await searchJobs({
        keywords: filters.keywords,
        location: filters.location,
        country: "in",
        maxResults: 20,
        page: 1,
      });
      if (response.success === false) throw new Error(response.message);
      setJobs(response.data?.jobs || []);
    } catch (error) {
      setError(error.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadRecommended = async () => {
    setLoading(true);
    setError(null);
    setSelectedJob(null);
    setShowJobDetails(false);
    try {
      const response = await getRecommendedJobs();
      if (response.success === false) throw new Error(response.message);
      setJobs(response.data?.jobs || []);
    } catch (error) {
      setError("Failed to load recommendations.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (mode) => {
    setViewMode(mode);
    if (mode === "search") {
      if (filters.keywords) handleSearchJobs();
      else setJobs([]);
    } else if (mode === "recommended") {
      handleLoadRecommended();
    } else if (mode === "saved") {
      handleFetchSavedJobsForView();
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveJob = async (job) => {
    const response = await saveJob(job);
    if (response.success !== false)
      setSavedJobIds((prev) => new Set([...prev, job.id]));
  };

  const handleUnsaveJob = async (jobId) => {
    const response = await unsaveJob(jobId);
    if (response.success !== false) {
      setSavedJobIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });

      if (viewMode === "saved") {
        setJobs((prevJobs) => prevJobs.filter((job) => job.id !== jobId));
        if (selectedJob?.id === jobId) {
          setShowJobDetails(false);
          setSelectedJob(null);
        }
      }
    }
  };

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    setShowJobDetails(true);
  };

  const handleCloseDetails = () => {
    setShowJobDetails(false);
    setTimeout(() => setSelectedJob(null), 300);
  };

  return (
    <div className="jobs-container">
      <div className="jobs-sidebar">
        <Sidebar />
      </div>

      <div className="jobs-main-area">
        <div className="jobs-page-header">
          <TopHeader
            fullName={user?.fullname || "User"}
            title="Find your next role"
            hideGreeting
          />
        </div>

        {error && (
          <div
            style={{
              margin: "0 24px 20px",
              padding: "14px",
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "12px",
            }}
          >
            {error}{" "}
            <button
              onClick={() => setError(null)}
              style={{ float: "right", background: "none", border: "none" }}
            >
              ✕
            </button>
          </div>
        )}

        <div
          className={`jobs-content-grid ${
            showJobDetails ? "details-open" : ""
          }`}
        >
          {showMobileFilters && (
            <div
              className="mobile-filter-overlay"
              onClick={() => setShowMobileFilters(false)}
            />
          )}

          <JobFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onSearch={handleSearchJobs}
            isOpen={showMobileFilters}
            onClose={() => setShowMobileFilters(false)}
            isDisabled={viewMode !== "search"}
          />

          <JobFeed
            jobs={jobs}
            loading={loading}
            viewMode={viewMode}
            onViewChange={handleViewChange}
            selectedJob={selectedJob}
            onSelectJob={handleSelectJob}
            onToggleFilters={() => setShowMobileFilters(true)}
            savedJobIds={savedJobIds}
            onSaveJob={handleSaveJob}
            onUnsaveJob={handleUnsaveJob}
            sortBy={filters.sortBy}
            onSortChange={(val) => handleFilterChange("sortBy", val)}
            user={user} 
          />

          {showJobDetails && (
            <div
              className="details-overlay-backdrop"
              onClick={handleCloseDetails}
            ></div>
          )}

          <JobDetails
            job={selectedJob}
            isVisible={showJobDetails}
            onClose={handleCloseDetails}
            isSaved={selectedJob ? savedJobIds.has(selectedJob.id) : false}
            onSaveJob={handleSaveJob}
            onUnsaveJob={handleUnsaveJob}
          />
        </div>
      </div>
    </div>
  );
};

export default Jobs;