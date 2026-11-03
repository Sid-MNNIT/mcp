import React from "react";

export default function EmailList({ 
  emails, 
  selectedEmail, 
  onSelectEmail, 
  fullWidth, 
  searchQuery, 
  onSearchChange,
}) {
  return (
    <div className={`email-list-col ${fullWidth ? "full-width" : ""}`}>
      
      {/* HEADER */}
      <div className="email-list-header">
        <div className="list-top-actions">
          <h2 className="list-title">Inbox</h2>
        </div>

        <div className="search-row-simple">
          <input 
            type="text" 
            placeholder="Search emails..." 
            className="search-input-simple"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      
      {/* SCROLLABLE LIST */}
      <div className="email-list-scroll">
        {emails.map((email) => (
            <div 
              key={email.id} 
              className={`email-item ${selectedEmail?.id === email.id ? "active" : ""} ${!email.read ? "unread" : ""}`}
              onClick={() => onSelectEmail(email)}
            >
              {/* TOP ROW: Logo/Avatar + Text */}
              <div className="email-item-header-row">
                
                {/* CIRCLE AVATAR */}
                {email.logo ? (
                  <img src={email.logo} alt="logo" className="org-logo-small" />
                ) : (
                  <div className="org-logo-small" style={{
                    display: 'grid', placeItems: 'center', fontWeight: 'bold', 
                    color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe'
                  }}>
                    {email.company.charAt(0)}
                  </div>
                )}
                
                <div className="header-text-col">
                  <div className="sender-row-flex">
                    <span className="email-sender">{email.sender}</span>
                    <span className="email-time">{email.time}</span>
                  </div>
                  <div className="email-item-sub">{email.subject}</div>
                </div>
              </div>
              
              {/* PREVIEW */}
              <div className="email-item-preview">
                {email.preview}
              </div>

              {/* TAGS */}
              {email.tag && (
                <div className="email-item-footer">
                   <span className={`email-tag tag-${email.tagType || 'success'}`}>
                      {email.tag}
                   </span>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}