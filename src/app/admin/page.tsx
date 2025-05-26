// src/app/admin/page.tsx
"use client";

import { useState } from "react"; // Removed useEffect
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";
import { revalidateItemsCacheAction } from "../actions";
import Link from "next/link"; // Import Link for navigation

/* -------------------------------------------------
  1️⃣  Type Definitions & Mappings
-------------------------------------------------- */

// Interface for the data structure after parsing (free-form or JSON)
interface ParsedItemData {
  name?: string | null;
  buyregular?: string | null;
  buygold?: string | null;
  buydiamond?: string | null;
  buyemerald?: string | null;
  sellregular?: string | null;
  sellgold?: string | null;
  selldiamond?: string | null;
  sellemerald?: string | null;
  publisher?: string | null;
  date?: string | null; // Assuming date is initially a string from input
  image?: string | null;
  description?: string | null;
  // Allow other potential keys from parsing, ensuring values are string or null
  [key: string]: string | null | undefined;
}

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

function normalizeJsonRecord(record: Record<string, unknown> | null | undefined): ParsedItemData {
  const intermediateOut: Record<string, string | null> = {};
  if (typeof record !== 'object' || record === null) {
    return {};
  }
  for (const [k, v] of Object.entries(record)) {
    const key = String(k).replace(/\s/g, "").toLowerCase(); // Ensure k is string and normalized
    intermediateOut[key] = v === "" || v === "אין נתון" || v === undefined ? null : String(v);
  }

  const filtered: ParsedItemData = {};
  for (const k of Object.keys(intermediateOut)) {
    if (allowedFields.includes(k)) {
      filtered[k as keyof ParsedItemData] = intermediateOut[k];
    }
  }
  return filtered;
}

function parseFreeForm(data: string): ParsedItemData {
  const out: ParsedItemData = {};
  if (typeof data !== 'string') return out;
  for (const line of data.split("\n")) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const key = parts[0].trim();
    const val = parts.slice(1).join(":").trim();
    const col = fieldMapping[key];
    if (col && allowedFields.includes(col)) { // Ensure col is an allowed field
        out[col as keyof ParsedItemData] = val === "" || val === "אין נתון" ? null : val;
    }
  }
  return out;
}

function parseJsonObjects(block: string): ParsedItemData[] {
  if (typeof block !== 'string') return [];
  const regex = /{[\s\S]*?}/g;
  let matches: string[] = [];
  try {
    const regexMatches = block.match(regex);
    if (regexMatches) {
      matches = regexMatches;
    }
  } catch (_e) { // Marked as unused
    // console.warn("Regex match failed for JSON parsing:", (_e as Error).message);
  }
  return matches
    .map((m: string) => {
      try {
        return JSON.parse(m) as Record<string, unknown>; // Parse to generic object
      }
      catch (_e) { // Marked as unused
        return null;
      }
    })
    .filter((record): record is Record<string, unknown> => record !== null && typeof record === 'object')
    .map(normalizeJsonRecord); // normalizeJsonRecord handles Record<string, unknown>
}

function parseRecords(text: string): ParsedItemData[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.includes("שם מוזהב:")) {
    return trimmed.split(/\n\s*\n/).filter(Boolean).map(parseFreeForm);
  }

  const firstChar = trimmed[0];
  if (firstChar === "{" || firstChar === "[") {
    try {
      const obj = JSON.parse(trimmed);
      const arr = (Array.isArray(obj) ? obj : [obj]) as Record<string, unknown>[];
      if (arr.every(record => typeof record === 'object' && record !== null)) {
        return arr.map(normalizeJsonRecord);
      }
    } catch {
      const arrFromObjects = parseJsonObjects(trimmed);
      if (arrFromObjects.length > 0 && arrFromObjects.some(obj => Object.keys(obj).length > 0)) {
        return arrFromObjects;
      }
    }
  }
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

  async function getDefinitionId(rec: ParsedItemData): Promise<string | null> {
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
    if (isPublishing || isLoading || !user || !profile?.is_admin) return;

    setIsPublishing(true);
    setMessage("");
    setError("");

    const records: ParsedItemData[] = parseRecords(inputData);
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
      if (Object.keys(rec).length === 0) {
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
        .eq("date", rec.date ?? null) // Ensure date is in ISO format if your DB expects a date/timestamp
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
        date: rec.date ?? null, // Consider converting to ISO string if needed: rec.date ? new Date(rec.date).toISOString() : null
        admin_id: user.id,
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
      setInputData("");
    }

    if (successfullyPublishedAtLeastOne) {
      try {
        await revalidateItemsCacheAction();
        setMessage(prev => prev + " • ✅ מטמון הפריטים באתר התעדכן.");
      } catch (revalError: unknown) { // Typed as unknown
        const errorMessage = revalError instanceof Error ? revalError.message : String(revalError);
        console.error("Admin Page: Calling Server Action for cache revalidation failed:", errorMessage);
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
        className="title-input"
        style={{
            width: "100%",
            minHeight: "250px",
            marginBottom: "1rem",
            whiteSpace: "pre-wrap",
            textAlign: "right",
            direction: "rtl",
            padding: "10px",
            boxSizing: "border-box",
            backgroundColor: "var(--background-input, #1f1f1f)",
            color: "var(--foreground-input, #ededed)",
            border: "1px solid var(--border-color, #444)",
            borderRadius: "4px"
        }}
      />
      <button
        onClick={handlePublish}
        disabled={isPublishing || !inputData.trim()}
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