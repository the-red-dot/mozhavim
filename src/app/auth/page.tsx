// src/app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // For registration mode
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    let emailToLogin = emailOrUsername;

    if (!emailOrUsername.includes("@")) {
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_email_by_username", {
        p_username: emailOrUsername,
      });
      if (rpcError || !rpcData) {
        setMessage("שם משתמש לא נמצא או אירעה שגיאה.");
        return;
      }
      emailToLogin = rpcData;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("התחברת בהצלחה!");
      setTimeout(() => router.push("/"), 1500); // Redirect after a short delay
      // Consider calling router.refresh() if you need to immediately reflect auth state changes in Server Components
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!username.trim()) {
        setMessage("שם משתמש הוא שדה חובה.");
        return;
    }
    if (!password) {
        setMessage("סיסמה היא שדה חובה.");
        return;
    }


    // Check if username is taken (optional, as API route might do it too, but good for immediate client-side feedback)
    const { data: exists, error: rpcCheckError } = await supabase.rpc("check_username_exists", {
      p_username: username,
    });

    if (rpcCheckError){
        setMessage(`שגיאה בבדיקת שם משתמש: ${rpcCheckError.message}`);
        return;
    }
    if (exists) {
      setMessage("שם משתמש כבר קיים");
      return;
    }

    // If emailOrUsername is empty OR doesn't look like an email, register via API (username-only flow)
    const isUsernameOnlyRegistration = !emailOrUsername.trim() || !emailOrUsername.includes("@");

    if (isUsernameOnlyRegistration) {
      const response = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }), // Send username from state
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "אירעה שגיאה ברישום.");
      } else {
        setMessage("נרשמת בהצלחה! אתה יכול להתחבר עכשיו.");
        setMode("login"); // Switch to login mode
        setEmailOrUsername(username); // Pre-fill username for login
        setPassword(""); // Clear password
        setUsername(""); // Clear username field for registration
      }
    } else {
      // Register with real email directly
      const { error } = await supabase.auth.signUp({ // Removed 'data: _data'
        email: emailOrUsername, // Use the provided email
        password,
        options: {
          data: { username: username }, // Pass username from state to be stored in user_metadata
        },
      });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage("נרשמת! בדוק את האימייל לאימות.");
        // Optionally switch to login or clear fields
      }
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!emailOrUsername.includes("@")) {
      setMessage("אנא הזן כתובת אימייל תקינה לשחזור סיסמה.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(emailOrUsername, {
        // redirectTo: `${window.location.origin}/auth/update-password`, // Optional: specify redirect URL
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("אם קיים חשבון עם אימייל זה, ישלח אליך קישור לאיפוס סיסמה.");
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === "login" ? "התחברות" : "רישום"}</h2>
      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <label>
          {mode === "login" ? "אימייל או שם משתמש:" : "אימייל (אופציונלי):"}
          <input
            type="text"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            placeholder={mode === "register" ? "example@example.com (אופציונלי)" : "אימייל או שם משתמש"}
            required={mode === "login"}
          />
        </label>
        {mode === "register" && (
          <label>
            שם משתמש:
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="שם משתמש (חובה)"
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
            placeholder="לפחות 6 תווים"
          />
        </label>
        <button type="submit">{mode === "login" ? "התחבר" : "הרשם"}</button>
      </form>
      {mode === "login" && (
        <button onClick={handlePasswordReset} className="recover-btn">
          שכחת סיסמה?
        </button>
      )}
      {message && <p className="auth-message">{message}</p>}
      <div className="auth-toggle">
        <span>{mode === "login" ? "אין לך חשבון?" : "כבר יש לך חשבון?"}</span>
        <button onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setMessage(""); // Clear message when toggling
            // Optionally clear form fields
            // setEmailOrUsername("");
            // setUsername("");
            // setPassword("");
        }}>
          {mode === "login" ? "הרשם כאן" : "התחבר כאן"}
        </button>
      </div>
    </div>
  );
}