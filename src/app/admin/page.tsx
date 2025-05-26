// src/app/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";
import { revalidateItemsCacheAction } from "../actions";
import Link from "next/link"; // Import Link for navigation

/* -------------------------------------------------
  1️⃣  free‑form key → column mapping (Hebrew)
-------------------------------------------------- */
const fieldMapping: Record<string, string> = {
  "שם מוזהב": "name",
  "קנייה (רגיל)": "buyregular",
  "קנייה": "buyregular", // Alias for convenience
  "קנייה (זהב)": "buygold",
  "קנייה (יהלום)": "buydiamond",
  "קנייה (אמרלד)": "buyemerald",
  "מכירה (רגיל)": "sellregular",
  "מכירה (זהב)": "sellgold",
  "מכירה (יהלום)": "selldiamond",
  "מכירה (אמרלד)": "sellemerald",
  "פורסם ע\"י": "publisher",
  "תאריך פרסום": "date",
  "תמונה": "image",
  "תיאור": "description",
};

const allowedFields = [
  "name", "buyregular", "buygold", "buydiamond", "buyemerald",
  "sellregular", "sellgold", "selldiamond", "sellemerald",
  "publisher", "date", "image", "description",
];

/* -------------------------------------------------
  2️⃣  helpers — parse free text / JSON
-------------------------------------------------- */
function normalizeJsonRecord(record: any): any {
  const out: any = {};
  if (typeof record !== 'object' || record === null) {
    return {};
  }
  for (const [k, v] of Object.entries(record)) {
    const key = String(k).replace(/\s/g, "").toLowerCase(); // Ensure k is string
    out[key] = v;
  }
  const filtered: any = {};
  for (const k of Object.keys(out)) {
    if (allowedFields.includes(k)) filtered[k] = out[k];
  }
  return filtered;
}

function parseFreeForm(data: string): any {
  const out: any = {};
  if (typeof data !== 'string') return out;
  for (const line of data.split("\n")) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const key = parts[0].trim();
    const val = parts.slice(1).join(":").trim();
    const col = fieldMapping[key];
    if (col) out[col] = val === "" || val === "אין נתון" ? null : val;
  }
  return out;
}

function parseJsonObjects(block: string): any[] {
  if (typeof block !== 'string') return [];
  const regex = /{[\s\S]*?}/g;
  let matches: string[] = [];
  try {
    const regexMatches = block.match(regex);
    if (regexMatches) {
      matches = regexMatches;
    }
  } catch (e) {
    // console.warn("Regex match failed for JSON parsing:", e);
  }
  return matches
    .map((m: string) => {
      try { return JSON.parse(m); }
      catch (e) {
        return null;
      }
    })
    .filter(record => record !== null && typeof record === 'object')
    .map(normalizeJsonRecord);
}

function parseRecords(text: string): any[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Favor free-form if "שם מוזהב:" is present, as it's a strong indicator.
  if (trimmed.includes("שם מוזהב:")) {
    return trimmed.split(/\n\s*\n/).filter(Boolean).map(parseFreeForm);
  }

  // Try JSON parsing if it looks like JSON (array or object).
  const firstChar = trimmed[0];
  if (firstChar === "{" || firstChar === "[") {
    try {
      const obj = JSON.parse(trimmed);
      const arr = Array.isArray(obj) ? obj : [obj];
      // Check if the parsed result is an array of objects before mapping
      if (arr.every(record => typeof record === 'object' && record !== null)) {
        return arr.map(normalizeJsonRecord);
      }
    } catch {
      // If JSON.parse fails, try to parse as a block of multiple JSON objects
      const arrFromObjects = parseJsonObjects(trimmed);
      if (arrFromObjects.length > 0 && arrFromObjects.some(obj => Object.keys(obj).length > 0)) {
        return arrFromObjects;
      }
    }
  }
  // Fallback to free-form if not clearly multi-record JSON or if specific key isn't found
  return trimmed.split(/\n\s*\n/).filter(Boolean).map(parseFreeForm);
}


/* -------------------------------------------------
  3️⃣  React component
-------------------------------------------------- */
export default function AdminManagementPage() {
  const { user, profile, isLoading, sessionInitiallyChecked } = useUser();
  const [inputData, setInputData] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  async function getDefinitionId(rec: any): Promise<string | null> {
    const name = rec.name?.trim();
    if (!name) {
      console.error("getDefinitionId: Record is missing a name.", rec);
      return null;
    }

    const upsertDefinitionData: {
      name: string;
      description?: string | null;
      image?: string | null;
    } = { name };

    if (rec.description !== undefined) {
      upsertDefinitionData.description = rec.description ?? null;
    }
    if (rec.image !== undefined) {
      upsertDefinitionData.image = rec.image ?? null;
    }

    const { data, error: upsertError } = await supabase
      .from("item_definitions")
      .upsert(upsertDefinitionData, { onConflict: "name" })
      .select("id")
      .single();

    if (upsertError) {
      console.error("Definition upsert error for '" + name + "':", upsertError.message);
      return null;
    }
    return data?.id ?? null;
  }

  const handlePublish = async () => {
    // Gatekeeping for user status is handled by the main component render logic
    if (isPublishing || isLoading || !user || !profile?.is_admin) return;

    setIsPublishing(true);
    setMessage("");
    setError("");

    const records = parseRecords(inputData);
    if (!records.length || records.every(r => Object.keys(r).length === 0)) {
      setError("לא נמצאו רשומות תקינות לייבוא מהטקסט שהוזן, או שהרשומות ריקות.");
      setIsPublishing(false);
      return;
    }

    let okCount = 0;
    let failCount = 0;
    const failMessages: string[] = [];
    let successfullyPublishedAtLeastOne = false;

    for (const rec of records) {
      if (Object.keys(rec).length === 0) { // Skip fully empty records after parsing
          failCount++;
          failMessages.push("רשומה ריקה זוהתה ודולגה.");
          continue;
      }
      if (!rec.name || typeof rec.name !== 'string' || !rec.name.trim()) {
        failCount++;
        failMessages.push("רשומה ללא שם מוזהב תקין לא תתווסף. תוכן רשומה: " + JSON.stringify(rec));
        continue;
      }

      const definitionId = await getDefinitionId(rec);
      if (!definitionId) {
        failCount++;
        failMessages.push(`שגיאה ביצירת/אחזור הגדרת פריט (definition) עבור "${rec.name}".`);
        continue;
      }

      const { data: duplicateCheck, error: duplicateCheckError } = await supabase
        .from("item_listings")
        .select("id")
        .eq("item_id", definitionId)
        .eq("publisher", rec.publisher ?? null)
        .eq("date", rec.date ?? null)
        .maybeSingle();

      if (duplicateCheckError) {
        failCount++;
        failMessages.push(`שגיאה בבדיקת כפילויות עבור "${rec.name}": ${duplicateCheckError.message}`);
        console.error("Duplicate check error for", rec.name, duplicateCheckError);
        continue;
      }

      if (duplicateCheck) {
        failCount++;
        failMessages.push(`כפילות: "${rec.name}" כבר קיים עם אותו מפרסם ותאריך.`);
        continue;
      }

      const listingData = {
        item_id: definitionId,
        publisher: rec.publisher ?? null,
        buyregular: rec.buyregular ?? null,
        buygold: rec.buygold ?? null,
        buydiamond: rec.buydiamond ?? null,
        buyemerald: rec.buyemerald ?? null,
        sellregular: rec.sellregular ?? null,
        sellgold: rec.sellgold ?? null,
        selldiamond: rec.selldiamond ?? null,
        sellemerald: rec.sellemerald ?? null,
        date: rec.date ?? null,
        admin_id: user.id, // user is guaranteed to be non-null here due to page gate
      };

      const { error: insertError } = await supabase
        .from("item_listings")
        .insert(listingData);

      if (insertError) {
        failCount++;
        failMessages.push(`שגיאת הוספה לטבלת listings עבור "${rec.name}": ${insertError.message}`);
        console.error("Insert error for item_listings for", rec.name, insertError);
      } else {
        okCount++;
        successfullyPublishedAtLeastOne = true;
      }
    }

    let finalMessageText = "";
    if (okCount > 0) {
        finalMessageText += `✅ נוספו ${okCount} פריטים.`;
    }
    if (failCount > 0) {
        finalMessageText += `${okCount > 0 ? " • " : ""}❌ נכשלו ${failCount} פריטים.`;
    }
    setMessage(finalMessageText || "תהליך הפרסום הסתיים.");


    if (failMessages.length > 0) {
      setError("פירוט שגיאות:\n" + failMessages.join("\n"));
    } else {
      setError("");
    }

    if (failCount === 0 && okCount > 0) {
      setInputData(""); // Clear input only if all were successful
    }

    if (successfullyPublishedAtLeastOne) {
      try {
        // console.log("Admin Page: Calling revalidateItemsCacheAction Server Action...");
        await revalidateItemsCacheAction();
        setMessage(prev => prev + " • ✅ מטמון הפריטים באתר התעדכן.");
        // console.log("Admin Page: Server Action for cache revalidation completed.");
      } catch (revalError: any) {
        console.error("Admin Page: Calling Server Action for cache revalidation failed:", revalError.message);
        setMessage(prev => prev + " • ⚠️ שגיאה בעדכון מטמון הפריטים באתר.");
      }
    }
    setIsPublishing(false);
  };

  /* --------------- UI --------------- */
  if (isLoading) {
    return (
        <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center", color: "var(--foreground)" }}>
            <h1>מערכת הוספת מוזהבים</h1>
            <p>טוען נתוני משתמש...</p>
        </div>
    );
  }

  // After initial loading (isLoading is false), sessionInitiallyChecked should be true.
  // If not, it implies an unexpected state, but typically covered by isLoading.
  if (!sessionInitiallyChecked) {
      return (
           <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center", color: "var(--foreground)" }}>
              <h1>מערכת הוספת מוזהבים</h1>
              <p>ממתין לאימות סשן...</p>
          </div>
      );
  }

  if (!user || !profile?.is_admin) {
      return (
          <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center", color: "var(--foreground)" }}>
              <h1>מערכת הוספת מוזהבים</h1>
              <p className="error" style={{ color: "#FF6B6B", fontSize: "1.1rem", marginTop: "1rem" }}>
                  {!user ? "אינך מחובר. " : "אין לך הרשאות אדמין לגשת לדף זה."}
              </p>
              {!user && (
                  <Link href="/auth" style={{color: "#4285f4", textDecoration: "underline", fontSize: "1rem", marginTop: "0.5rem", display: "inline-block"}}>
                      עבור לדף התחברות
                  </Link>
              )}
          </div>
      );
  }

  // User is logged in and is an admin
  const publishButtonText = isPublishing ? "מפרסם..." : "פרסם פריטים";

  return (
    <div className="admin-post-creation" style={{ marginTop: "2rem" }}>
      <h1>מערכת הוספת מוזהבים</h1>
      <textarea
        placeholder={`הזן JSON או טקסט חופשי. רשומות מפרידים בשורה ריקה ("enter enter").
דוגמה לטקסט חופשי:
שם מוזהב: פריט לדוגמה חדש
קנייה (רגיל): 1000
מכירה (רגיל): 1200
פורסם ע"י: אדמין בדיקה
תאריך פרסום: 2025-05-17
תיאור: זהו פריט בדיקה חדש להדגמת המערכת.
תמונה: (אופציונלי) https://example.com/image.png

שם מוזהב: פריט נוסף
קנייה (זהב): 50
מכירה (יהלום): 300`}
        value={inputData}
        onChange={(e) => setInputData(e.target.value)}
        className="title-input" // Ensure this class exists and is styled in globals.css
        style={{ 
            width: "100%", 
            minHeight: "250px", 
            marginBottom: "1rem", 
            whiteSpace: "pre-wrap", 
            textAlign: "right", 
            direction: "rtl", 
            padding: "10px", 
            boxSizing: "border-box",
            backgroundColor: "var(--background-input, #1f1f1f)", // Example input background
            color: "var(--foreground-input, #ededed)", // Example input text color
            border: "1px solid var(--border-color, #444)", // Example border
            borderRadius: "4px"
        }}
      />
      <button 
        onClick={handlePublish} 
        disabled={isPublishing || !inputData.trim()}
        // Ensure button styles are present in globals.css or defined inline
        style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: (isPublishing || !inputData.trim()) ? "#555" : "#4285f4",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: (isPublishing || !inputData.trim()) ? "not-allowed" : "pointer",
            fontSize: "1rem",
            opacity: (isPublishing || !inputData.trim()) ? 0.7 : 1
        }}
      >
        {publishButtonText}
      </button>

      {message && (
        <p style={{ color: "var(--success-color, #34A853)", whiteSpace: "pre-wrap", textAlign: "right", marginTop: "1rem" }}>{message}</p>
      )}
      {error && (
        <p className="error" style={{ color: "var(--error-color, #EA4335)", whiteSpace: "pre-wrap", textAlign: "right", marginTop: "0.5rem" }}>{error}</p>
      )}
    </div>
  );
}