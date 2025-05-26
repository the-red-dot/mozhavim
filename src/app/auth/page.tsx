// src/app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    let email = emailOrUsername;

    // If input doesn't contain '@', treat it as a username and fetch the email
    if (!emailOrUsername.includes("@")) {
      const { data, error } = await supabase.rpc("get_email_by_username", {
        p_username: emailOrUsername,
      });
      if (error || !data) {
        setMessage("שם משתמש לא נמצא");
        return;
      }
      email = data;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("התחברת בהצלחה!");
      setTimeout(() => router.push("/"), 2000);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    // Check if username is taken
    const { data: exists } = await supabase.rpc("check_username_exists", {
      p_username: username,
    });
    if (exists) {
      setMessage("שם משתמש כבר קיים");
      return;
    }

    const isFakeEmail = !emailOrUsername.includes("@");

    if (isFakeEmail) {
      // Register with fake email via API route
      const response = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "אירעה שגיאה ברישום"); // Provide a fallback error message
      } else {
        setMessage("נרשמת בהצלחה! אתה יכול להתחבר עכשיו.");
      }
    } else {
      // Register with real email
      // FIX: Renamed 'data' to '_data' as it was not used.
      const { data: _data, error } = await supabase.auth.signUp({
        email: emailOrUsername,
        password,
        options: { data: { username } }, // 'username' here is from the component's state
      });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage("נרשמת! בדוק את האימייל לאימות.");
      }
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    // Ensure emailOrUsername is provided for password reset if it's not empty.
    if (!emailOrUsername.trim()) {
        setMessage("אנא הזן אימייל לשחזור סיסמה.");
        return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(emailOrUsername);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("בדוק את תיבת האימייל שלך לקבלת הוראות לאיפוס הסיסמה.");
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === "login" ? "התחברות" : "רישום"}</h2>
      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <label>
          {mode === "login" ? "אימייל או שם משתמש:" : "אימייל (אופציונלי, השאר ריק לרישום עם שם משתמש בלבד):"}
          <input
            type="text"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            placeholder={mode === "register" ? "example@example.com" : "אימייל או שם משתמש"}
            required={mode === "login"} // Email/Username is required for login
          />
        </label>
        {mode === "register" && (
          <label>
            שם משתמש:
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required // Username is always required for registration
            />
          </label>
        )}
        <label>
          סיסמה:
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit">{mode === "login" ? "התחבר" : "הרשם"}</button>
      </form>
      {mode === "login" && (
        <button onClick={handlePasswordReset} className="recover-btn">
          שחזור סיסמה
        </button>
      )}
      {message && <p className="auth-message">{message}</p>}
      <div className="auth-toggle">
        <span>{mode === "login" ? "אין לך חשבון?" : "כבר יש לך חשבון?"}</span>
        <button onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setMessage(""); // Clear message when toggling mode
          // Optionally clear form fields as well
          // setEmailOrUsername("");
          // setUsername("");
          // setPassword("");
        }}>
          {mode === "login" ? "הרשם" : "התחבר"}
        </button>
      </div>
    </div>
  );
}