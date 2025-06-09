// src/app/admin/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";
import { revalidateItemsCacheAction } from "../actions";

/* -------------------------------------------------
  1️⃣  Type Definitions & Mappings
-------------------------------------------------- */
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
  date?: string | null;
  image?: string | null;
  description?: string | null;
  [key: string]: string | null | undefined;
}

/**
 * Map the free-text Hebrew labels to our `ParsedItemData` keys.
 * NOTE: the apostrophe in ע"י is inside a double-quoted string, so TS is happy.
 */
const fieldMapping: Record<string, keyof ParsedItemData> = {
  "שם מוזהב":       "name",
  "קנייה (רגיל)":   "buyregular",
  "קנייה":          "buyregular",
  "קנייה (זהב)":    "buygold",
  "קנייה (יהלום)":  "buydiamond",
  "קנייה (אמרלד)":  "buyemerald",
  "מכירה (רגיל)":   "sellregular",
  "מכירה (זהב)":    "sellgold",
  "מכירה (יהלום)":  "selldiamond",
  "מכירה (אמרלד)":  "sellemerald",
  "פורסם ע\u05F4י": "publisher",
  "תאריך פרסום":    "date",
  "תמונה":          "image",
  "תיאור":          "description",
};

/** Only these keys are allowed in the final `ParsedItemData` */
const allowedFields = new Set<keyof ParsedItemData>([
  "name",
  "buyregular",
  "buygold",
  "buydiamond",
  "buyemerald",
  "sellregular",
  "sellgold",
  "selldiamond",
  "sellemerald",
  "publisher",
  "date",
  "image",
  "description",
]);

/* -------------------------------------------------
  2️⃣  Helpers — parse free-text or embedded JSON
-------------------------------------------------- */
function normalizeJsonRecord(
  record: Record<string, unknown> | null | undefined
): ParsedItemData {
  const out: ParsedItemData = {};
  if (!record || typeof record !== "object") return out;

  for (const [rawKey, rawVal] of Object.entries(record)) {
    const key = rawKey.replace(/\s+/g, "").toLowerCase();
    // find a matching allowed field
    for (const allowed of allowedFields) {
      if (allowed === key) {
        const val =
          rawVal === "" || rawVal === "אין נתון" || rawVal == null
            ? null
            : String(rawVal);
        out[allowed] = val;
      }
    }
  }
  return out;
}

function parseFreeForm(block: string): ParsedItemData {
  const out: ParsedItemData = {};
  block.split("\n").forEach((line) => {
    const [label, ...rest] = line.split(":");
    if (!label || rest.length === 0) return;
    const trimmedLabel = label.trim();
    const mappedKey = fieldMapping[trimmedLabel];
    if (mappedKey && allowedFields.has(mappedKey)) {
      const value = rest.join(":").trim();
      out[mappedKey] = value === "" || value === "אין נתון" ? null : value;
    }
  });
  return out;
}

function parseJsonObjects(block: string): ParsedItemData[] {
  // find all {...} fragments
  const rawMatches = block.match(/{[\s\S]*?}/g) || [];
  return rawMatches
    .map((str) => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    })
    .filter((obj): obj is Record<string, unknown> => Boolean(obj))
    .map(normalizeJsonRecord);
}

function parseRecords(text: string): ParsedItemData[] {
  const t = text.trim();
  if (!t) return [];

  // free-form style if it contains our Hebrew marker
  if (t.includes("שם מוזהב:")) {
    return t.split(/\n\s*\n/).map(parseFreeForm);
  }

  // JSON style
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map(normalizeJsonRecord);
    } catch {
      return parseJsonObjects(t);
    }
  }

  return [];
}

/* -------------------------------------------------
  3️⃣  Admin React Component
-------------------------------------------------- */
export default function AdminManagementPage() {
  const { user, profile, isLoading, sessionInitiallyChecked } = useUser();

  const [inputData, setInputData] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  /** Upsert (definition) row and return its ID */
  async function getDefinitionId(rec: ParsedItemData): Promise<string | null> {
    const nm = rec.name?.trim();
    if (!nm) return null;

    const { data, error: upsertError } = await supabase
      .from("item_definitions")
      .upsert(
        { name: nm, description: rec.description || null, image: rec.image || null },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (upsertError || !data) return null;
    return data.id;
  }

  const handlePublish = async () => {
    if (isPublishing || isLoading || !user || !profile?.is_admin) return;

    setIsPublishing(true);
    setMessage("");
    setError("");

    const records = parseRecords(inputData);
    if (!records.length) {
      setError("לא נמצאו רשומות תקינות.");
      setIsPublishing(false);
      return;
    }

    let ok = 0,
      fail = 0;
    const failMsgs: string[] = [];

    for (const rec of records) {
      if (!rec.name?.trim()) {
        fail++;
        failMsgs.push("רשומה חסרת שם מוזהב דולגה.");
        continue;
      }

      const defId = await getDefinitionId(rec);
      if (!defId) {
        fail++;
        failMsgs.push(`שגיאה ביצירת definition עבור "${rec.name}".`);
        continue;
      }

      const { data: dup, error: dupErr } = await supabase
        .from("item_listings")
        .select("id")
        .eq("item_id", defId)
        .eq("publisher", rec.publisher || null)
        .eq("date", rec.date || null)
        .maybeSingle();

      if (dupErr) {
        fail++;
        failMsgs.push(`שגיאה בבדיקה כפילות עבור "${rec.name}".`);
        continue;
      }
      if (dup) {
        fail++;
        failMsgs.push(`"${rec.name}" כבר קיים (כפילות).`);
        continue;
      }

      const { error: insErr } = await supabase.from("item_listings").insert({
        item_id: defId,
        publisher: rec.publisher || null,
        buyregular: rec.buyregular || null,
        buygold: rec.buygold || null,
        buydiamond: rec.buydiamond || null,
        buyemerald: rec.buyemerald || null,
        sellregular: rec.sellregular || null,
        sellgold: rec.sellgold || null,
        selldiamond: rec.selldiamond || null,
        sellemerald: rec.sellemerald || null,
        date: rec.date || null,
        admin_id: user.id,
      });

      if (insErr) {
        fail++;
        failMsgs.push(`שגיאה בהוספת "${rec.name}" ל־listings.`);
      } else {
        ok++;
      }
    }

    // clear the input if we succeeded at least once
    if (ok) setInputData("");

    setMessage(
      `${ok ? `✅ נוספו ${ok}` : ""}${ok && fail ? " • " : ""}${fail ? `❌ נכשלו ${fail}` : ""}`
    );
    setError(failMsgs.join("\n"));

    // ── critical: revalidate the edge‐cache tag so desktop & mobile see the same data ──
    if (ok) {
      try {
        await revalidateItemsCacheAction();
        setMessage((m) => m + " • ✅ מטמון הפריטים התעדכן.");
      } catch {
        setMessage((m) => m + " • ⚠️ שגיאה בעדכון המטמון.");
      }
    }

    setIsPublishing(false);
  };

  // ── show loading state until we know the session status ──
  if (isLoading || !sessionInitiallyChecked) {
    return (
      <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center" }}>
        <h1>מערכת הוספת מוזהבים</h1>
        <p>טוען נתונים…</p>
      </div>
    );
  }

  // ── guard: only admins can access ──
  if (!user || !profile?.is_admin) {
    return (
      <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center" }}>
        <h1>מערכת הוספת מוזהבים</h1>
        <p style={{ color: "#FF6B6B" }}>
          {!user ? "עליך להתחבר." : "אין לך הרשאות אדמין."}
        </p>
        {!user && (
          <Link href="/auth" style={{ color: "#4285f4", textDecoration: "underline" }}>
            לדף התחברות
          </Link>
        )}
      </div>
    );
  }

  // ── the main textarea + publish button ──
  return (
    <div className="admin-post-creation" style={{ marginTop: "2rem" }}>
      <h1>מערכת הוספת מוזהבים</h1>

      <textarea
        value={inputData}
        onChange={(e) => setInputData(e.target.value)}
        placeholder={`הזן JSON או טקסט חופשי. רשומות מפרידים ברווח ריק (שורה ריקה).

דוגמה (טקסט חופשי):

שם מוזהב: פריט לדוגמה חדש
קנייה (רגיל): 1000
מכירה (רגיל): 1200
פורסם ע"י: אדמין בדיקה
תאריך פרסום: 2025-05-17
תיאור: זהו פריט בדיקה
תמונה: https://example.com/image.png

(שורה ריקה)
שם מוזהב: פריט נוסף
קנייה (זהב): 50
מכירה (יהלום): 300`}
        style={{
          width: "100%",
          minHeight: "260px",
          marginBottom: "1rem",
          direction: "rtl",
          whiteSpace: "pre-wrap",
          padding: "10px",
          boxSizing: "border-box",
          backgroundColor: "var(--background-input, #1f1f1f)",
          color: "var(--foreground-input, #ededed)",
          border: "1px solid var(--border-color, #444)",
          borderRadius: 4,
        }}
      />

      <button
        onClick={handlePublish}
        disabled={isPublishing || !inputData.trim()}
        style={{
          padding: "0.75rem 1.5rem",
          background: isPublishing || !inputData.trim() ? "#555" : "#4285f4",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: isPublishing || !inputData.trim() ? "not-allowed" : "pointer",
        }}
      >
        {isPublishing ? "מפרסם…" : "פרסם פריטים"}
      </button>

      {message && (
        <p style={{ color: "var(--success-color, #34A853)", whiteSpace: "pre-wrap", marginTop: "1rem" }}>
          {message}
        </p>
      )}
      {error && (
        <p style={{ color: "var(--error-color, #EA4335)", whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
