// src/app/auth/update-password/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient"; // Adjust path if necessary
import { User } from "@supabase/supabase-js";

export default function UpdatePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    // This effect handles the Supabase auth event when the page loads
    // after the user clicks the password reset link.
    // Supabase JS client automatically processes the token from the URL fragment.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // This event means the user has successfully initiated password recovery
          // and Supabase has processed the token from the URL.
          // The session object should now contain the user.
          if (session?.user) {
            setUser(session.user);
            setMessage("תוכל להזין כעת סיסמה חדשה.");
          } else {
            setError(
              "לא ניתן לאמת את בקשת איפוס הסיסמה. ייתכן שהקישור פג תוקף או שכבר נעשה בו שימוש."
            );
            // Optionally redirect to login or show a message to request a new link
            // setTimeout(() => router.push('/auth'), 5000);
          }
        } else if (session?.user) {
          // If there's a user session but not specifically PASSWORD_RECOVERY,
          // they might have navigated here while already logged in.
          // Or, if the recovery token was already processed and a session established.
          setUser(session.user);
        } else if (event === "SIGNED_OUT") {
          // If user signs out on this page for some reason
          setUser(null);
          setError("התנתקת. אנא התחבר שוב כדי לשנות סיסמה, או השתמש בקישור איפוס חדש.");
        }
      }
    );

    // Check for an existing session when the component mounts,
    // in case the onAuthStateChange doesn't fire immediately with PASSWORD_RECOVERY
    // or if the user navigates back to this page with a valid recovery session.
    const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && window.location.hash.includes('type=recovery')) {
            setUser(session.user);
            // Only set message if not already set by PASSWORD_RECOVERY event
            if (!message && !error) {
                 setMessage("תוכל להזין כעת סיסמה חדשה.");
            }
        } else if (!session?.user && window.location.hash.includes('type=recovery')) {
            // This case might happen if the token is in URL but Supabase hasn't processed it yet
            // or if it's invalid. The onAuthStateChange should handle it.
            // If still no user after a brief moment, it's likely an issue.
            setTimeout(() => {
                if (!user && !error) {
                     setError("הקישור לאיפוס סיסמה אינו תקין או שפג תוקפו. נסה לבקש קישור חדש.");
                }
            }, 2000);
        }
    };
    checkSession();


    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, message, error, user]); // Added user to dependencies

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!user) {
      setError(
        "לא זוהה משתמש. ייתכן שתצטרך לבקש קישור חדש לאיפוס סיסמה."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("הסיסמאות אינן תואמות.");
      return;
    }
    if (newPassword.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(`שגיאה בעדכון הסיסמה: ${updateError.message}`);
    } else {
      setMessage("הסיסמה עודכנה בהצלחה! הנך מועבר לדף ההתחברות.");
      setNewPassword("");
      setConfirmPassword("");
      // Sign out the user from the recovery session
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push("/auth"); // Redirect to login page
      }, 3000);
    }
  };

  return (
    <div className="auth-container" style={{ marginTop: "5rem" }}>
      <h2>איפוס סיסמה</h2>
      <form onSubmit={handleUpdatePassword}>
        <label>
          סיסמה חדשה:
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            disabled={!user || loading}
          />
        </label>
        <label>
          אימות סיסמה חדשה:
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={!user || loading}
          />
        </label>
        <button type="submit" disabled={!user || loading}>
          {loading ? "מעדכן..." : "עדכן סיסמה"}
        </button>
      </form>
      {message && <p className="auth-message" style={{ color: "green" }}>{message}</p>}
      {error && <p className="auth-message" style={{ color: "red" }}>{error}</p>}
      {!user && !error && !message && (
         <p className="auth-message">טוען נתונים או ממתין לפעולת משתמש...</p>
      )}
    </div>
  );
}