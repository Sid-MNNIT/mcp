import React, { useState, useEffect } from "react";
import Sidebar from "../components/layout/Sidebar";
import TopHeader from "../components/layout/TopHeader";
import ProfileHeader from "../components/profile/ProfileHeader";
import ProfileView from "../components/profile/ProfileView";
import ProfileEdit from "../components/profile/ProfileEdit";
import ChangePasswordModal from "../components/profile/ChangePasswordModal";
import ExperienceModal from "../components/profile/ExperienceModal";
import EducationModal from "../components/profile/EducationModal";
import AvatarModal from "../components/profile/AvatarModal";
import "../styles/dashboard.css";
import "../styles/profile.css";
import SkillsModal from "../components/profile/SkillsModal";
import {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  updateSkills,
  addExperience,
  updateExperience,
  deleteExperience,
  addEducation,
  updateEducation,
  deleteEducation,
} from "../utils/api";

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showExpModal, setShowExpModal] = useState(false);
  const [showEduModal, setShowEduModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false); 
  const [currentItem, setCurrentItem] = useState(null);

  const [user, setUser] = useState({
    fullname: "",
    email: "",
    headline: "",
    location: { city: "", country: "India" },
    about: "",
    avatar: "",
    socials: { linkedin: "", github: "", website: "" },
    skills: [],
    experience: [],
    education: []
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await getMyProfile();

        // Normalize relative avatar paths to full URL
        const BACKEND_URL =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        const rawAvatar = profile.avatar || "";
        const resolvedAvatar = rawAvatar.startsWith("http")
          ? rawAvatar
          : rawAvatar
          ? `${BACKEND_URL}${rawAvatar}`
          : "";

        setUser({
          fullname: profile.fullname || "",
          email: profile.email || "",
          headline: profile.headline || "",
          about: profile.about || "",
          avatar: resolvedAvatar,
          location: profile.location || { city: "", country: "India" },
          socials: profile.socials || { linkedin: "", github: "", website: "" },
          skills: profile.skills || [],
          experience: profile.experience || [],
          education: profile.education || [],
        });
      } catch (err) {
        console.error("Failed to load profile", err);
        alert("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);


  const handleSaveProfile = async (formData) => {
    try {
      const updatedProfile = await updateMyProfile(formData);
      setUser(prev => ({ ...prev, ...updatedProfile }));
      setIsEditing(false);
    } catch (err) {
      console.error("Profile update failed", err);
      alert("Failed to update profile");
    }
  };

  const handleAvatarUpdate = async (newUrl) => {
    try {
      // Persist the avatar URL to MongoDB
      await updateMyProfile({ avatar: newUrl });
      setUser((prev) => ({ ...prev, avatar: newUrl }));
      setShowAvatarModal(false);
    } catch (err) {
      console.error("Failed to save avatar", err);
      alert("Failed to save profile picture. Please try again.");
    }
  };

  // Experience handlers
  const openExpModal = (item = null) => { 
    setCurrentItem(item); 
    setShowExpModal(true); 
  };

  const handleSaveExperience = async (expData) => {
    try {
      let res;

      if (currentItem?._id) {
        res = await updateExperience(currentItem._id, expData);
      } else {
        res = await addExperience(expData);
      }

      setUser((prev) => ({
        ...prev,
        experience: res.experience,
      }));

      setShowExpModal(false);
      setCurrentItem(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save experience");
    }
  };

  const handleDeleteExperience = async (id) => {
    if (!window.confirm("Delete this experience?")) return;

    try {
      const res = await deleteExperience(id);

      setUser((prev) => ({
        ...prev,
        experience: res.experience,
      }));

      setShowExpModal(false);
      setCurrentItem(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete experience");
    }
  };

  // Education handlers
  const openEduModal = (item = null) => { 
    setCurrentItem(item); 
    setShowEduModal(true); 
  };

  const handleSaveEducation = async (eduData) => {
    try {
      let res;

      if (currentItem?._id) {
        res = await updateEducation(currentItem._id, eduData);
      } else {
        res = await addEducation(eduData);
      }

      setUser((prev) => ({
        ...prev,
        education: res.education,
      }));

      setShowEduModal(false);
      setCurrentItem(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save education");
    }
  };

  const handleDeleteEducation = async (id) => {
    if (!window.confirm("Delete this education?")) return;

    try {
      const res = await deleteEducation(id);

      setUser((prev) => ({
        ...prev,
        education: res.education,
      }));

      setShowEduModal(false);
      setCurrentItem(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete education");
    }
  };

  //  Skills handlers
  const openSkillsModal = () => {
    setShowSkillsModal(true);
  };

  const handleSaveSkills = async (skills) => {
    try {
      const res = await updateSkills(skills);
      
      setUser((prev) => ({
        ...prev,
        skills: res.skills,
      }));

      setShowSkillsModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update skills");
    }
  };

  if (loading) return (
    <div className="dashboard-shell">
      <div className="dashboard-root" style={{ paddingTop: '50px' }}>
        Loading Profile...
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="dashboard-root">
        <TopHeader 
          fullName={user.fullname} 
          hideGreeting={true} 
          title="Profile" 
        />
        <div className="profile-container">
          <ProfileHeader 
            user={user} 
            isEditing={isEditing} 
            toggleEdit={() => setIsEditing(!isEditing)} 
            onAvatarClick={() => setShowAvatarModal(true)} 
            defaultAvatar={DEFAULT_AVATAR} 
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "-10px" }}>
            <button 
              className="btn-social" 
              onClick={() => setShowPasswordModal(true)}
            >
              🔒 Change Password
            </button>
          </div>
          <div className="profile-content">
            {isEditing ? (
              <ProfileEdit 
                user={user} 
                onSave={handleSaveProfile} 
                onCancel={() => setIsEditing(false)} 
              />
            ) : (
              <ProfileView 
                user={user} 
                onEditExperience={openExpModal} 
                onEditEducation={openEduModal}
                onEditSkills={openSkillsModal}  
              />
            )}
          </div>
        </div>

        {/* Modals */}
        {showPasswordModal && (
          <ChangePasswordModal 
            onClose={() => setShowPasswordModal(false)} 
          />
        )}
        {showExpModal && (
          <ExperienceModal 
            initialData={currentItem} 
            onClose={() => setShowExpModal(false)} 
            onSave={handleSaveExperience} 
            onDelete={handleDeleteExperience} 
          />
        )}
        {showEduModal && (
          <EducationModal 
            initialData={currentItem} 
            onClose={() => setShowEduModal(false)} 
            onSave={handleSaveEducation} 
            onDelete={handleDeleteEducation} 
          />
        )}
        {showAvatarModal && (
          <AvatarModal 
            currentAvatar={user.avatar || DEFAULT_AVATAR} 
            onClose={() => setShowAvatarModal(false)} 
            onSave={handleAvatarUpdate} 
          />
        )}
        {/* Skills Modal */}
        {showSkillsModal && (
          <SkillsModal
            initialSkills={user.skills}
            onClose={() => setShowSkillsModal(false)}
            onSave={handleSaveSkills}
          />
        )}
      </main>
    </div>
  );
}