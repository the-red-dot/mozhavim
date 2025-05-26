// src/app/components/NavMenu.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "../context/UserContext"; // Updated import

export default function NavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  // Get all necessary values from the updated UserContext
  const { user, profile, isLoading, sessionInitiallyChecked, logout } = useUser();

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);


  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        burgerRef.current &&
        !burgerRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Logout function using logout from context
  const handleLogout = async () => {
    closeMenu(); // Close menu first
    try {
        await logout(); // Call the logout function from context
    } catch (e) {
        console.error("NavMenu: Error during logout call:", e);
        // Optionally handle UI feedback for logout error here
    }
  };

  let greetingText: string;
  if (isLoading) { // Covers both initial load and changes
    greetingText = "טוען...";
  } else if (user && profile) {
    greetingText = profile.username;
  } else if (user && !profile) {
    // User object exists, but profile is not loaded or doesn't exist.
    // This could mean the profile is still fetching (covered by isLoading if loadingUserProfile is true)
    // or that the profile fetch failed or the user genuinely has no profile record.
    greetingText = "משתמש"; // Or a more specific message like "טוען פרופיל..."
  } else {
    greetingText = ""; // No user, or initial load finished with no user. Handled by login link.
  }

  return (
    <>
      {/* Burger button */}
      <button
        ref={burgerRef}
        onClick={toggleMenu}
        className="nav-burger"
        aria-label="פתח/סגור תפריט"
        aria-expanded={isOpen}
      >
        <div
          className="burger-line"
          style={isOpen ? { transform: "rotate(45deg) translateY(0.625rem)", width: "2rem" } : { width: "2rem" }} 
        ></div>
        <div
          className="burger-line"
          style={isOpen ? { opacity: 0 } : { width: "2rem" }}
        ></div>
        <div
          className="burger-line"
          style={isOpen ? { transform: "rotate(-45deg) translateY(-0.625rem)", width: "2rem" } : { width: "2rem" }}
        ></div>
      </button>

      {/* Sidebar Menu */}
      <div ref={menuRef} className={`sidebar ${isOpen ? "open" : ""}`}>
        <button onClick={toggleMenu} className="close-btn" aria-label="סגור תפריט">
          &times; {/* Using HTML entity for '×' */}
        </button>
        
        {/* Show greeting paragraph only if user is present or initial loading is in progress */}
        { (user || isLoading) && (
          <p className="user-greeting">
            שלום, {greetingText}
          </p>
        )}
        
        <nav>
          <ul>
            <li>
              <Link href="/" onClick={closeMenu}>בית</Link>
            </li>
            <li>
              <Link href="/aitch" onClick={closeMenu}>מידע ועדכונים</Link>
            </li>
            {/* Show Admin link only if user is loaded, is admin, and session check is complete */}
            {!isLoading && sessionInitiallyChecked && user && profile?.is_admin && (
              <li>
                <Link href="/admin" onClick={closeMenu}>ניהול</Link>
              </li>
            )}
            
            {/* Conditional rendering for Login/Logout */}
            {!isLoading && sessionInitiallyChecked ? ( // Only show login/logout after initial check & not loading
              user ? (
                <li>
                  <button onClick={handleLogout} className="logout" disabled={isLoading}>
                    {isLoading ? "יוצא..." : "יציאה"}
                  </button>
                </li>
              ) : (
                <li>
                  <Link href="/auth" onClick={closeMenu}>התחברות/רישום</Link>
                </li>
              )
            ) : isLoading ? ( // If still loading, show a placeholder or nothing for auth links
                <li>
                    <span style={{padding: "15px 20px", display: "block", color: "var(--foreground-muted, #aaa)"}}>טוען אפשרויות...</span>
                </li>
            ) : null }
          </ul>
        </nav>
      </div>
    </>
  );
}
