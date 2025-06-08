// src/app/components/NavMenu.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "../context/UserContext";

export default function NavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const { user, profile, isLoading, sessionInitiallyChecked, logout } = useUser();

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleLogout = async () => {
    closeMenu();
    try {
      await logout();
    } catch (e) {
      console.error("NavMenu: Error during logout:", e);
    }
  };

  let greetingText: string;
  if (isLoading) {
    greetingText = "טוען...";
  } else if (user && profile) {
    greetingText = profile.username;
  } else if (user && !profile) {
    greetingText = "משתמש";
  } else {
    greetingText = "";
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
          style={
            isOpen
              ? { transform: "rotate(45deg) translateY(0.625rem)", width: "2rem" }
              : { width: "2rem" }
          }
        />
        <div
          className="burger-line"
          style={isOpen ? { opacity: 0 } : { width: "2rem" }}
        />
        <div
          className="burger-line"
          style={
            isOpen
              ? { transform: "rotate(-45deg) translateY(-0.625rem)", width: "2rem" }
              : { width: "2rem" }
          }
        />
      </button>

      {/* Sidebar Menu */}
      <div ref={menuRef} className={`sidebar ${isOpen ? "open" : ""}`}>
        <button
          onClick={toggleMenu}
          className="close-btn"
          aria-label="סגור תפריט"
        >
          &times;
        </button>

        {(user || isLoading) && (
          <p className="user-greeting">שלום, {greetingText}</p>
        )}

        <nav>
          <ul>
            <li>
              <Link href="/" onClick={closeMenu}>
                בית
              </Link>
            </li>
            <li>
              <Link href="/aitch" onClick={closeMenu}>
                מידע ועדכונים
              </Link>
            </li>
            <li>
              <Link href="/tik-sheli" onClick={closeMenu}>
                תיק שלי
              </Link>
            </li>
            {/* START: New Trading Page link */}
            <li>
              <Link href="/tradingPage" onClick={closeMenu}>
                טריידים
              </Link>
            </li>
            {/* END: New Trading Page link */}
            {!isLoading &&
              sessionInitiallyChecked &&
              user &&
              profile?.is_admin && (
                <li>
                  <Link href="/admin" onClick={closeMenu}>
                    ניהול
                  </Link>
                </li>
              )}

            {!isLoading && sessionInitiallyChecked ? (
              user ? (
                <li>
                  <button
                    onClick={handleLogout}
                    className="logout"
                    disabled={isLoading}
                  >
                    {isLoading ? "יוצא..." : "יציאה"}
                  </button>
                </li>
              ) : (
                <li>
                  <Link href="/auth" onClick={closeMenu}>
                    התחברות/רישום
                  </Link>
                </li>
              )
            ) : isLoading ? (
              <li>
                <span
                  style={{
                    padding: "15px 20px",
                    display: "block",
                    color: "var(--foreground-muted, #aaa)",
                  }}
                >
                  טוען אפשרויות...
                </span>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </>
  );
}