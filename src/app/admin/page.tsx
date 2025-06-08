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

const fieldMapping: Record<string, string> = {
  "שם מוזהב": "name",
  "קנייה (רגיל)": "buyregular",
  "קנייה": "buyregular",
  "קנייה (זהב)": "buygold",
  "קנייה (יהלום)": "buydiamond",
  "קנייה (אמרלד)": "buyemerald",
  "מכירה (רגיל)": "sellregular",
  "מכירה (זהב)": "sellgold",
  "מכירה (יהלום)": "selldiamond",
  "מכירה (אמרלד)": "sellemerald",
  'פורסם ע"י': "publisher",
  "תאריך פרסום": "date",
  "תמונה": "image",
  "תיאור": "description",
};

const allowedFields = [
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
];

/* -------------------------------------------------
  2️⃣  helpers — parse free text / JSON
-------------------------------------------------- */
function normalizeJsonRecord(record: Record<string, unknown> | null | undefined): ParsedItemData {
  const out: ParsedItemData = {};
  if (!record || typeof record !== "object") return out;

  for (const [k, v] of Object.entries(record)) {
    const key = String(k).replace(/\s/g, "").toLowerCase();
    if (allowedFields.includes(key)) {
      out[key as keyof ParsedItemData] =
        v === "" || v === "אין נתון" || v === undefined || v === null ? null : String(v);
    }
  }
  return out;
}

function parseFreeForm(block: string): ParsedItemData {
  const result: ParsedItemData = {};
  block.split("\n").forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) return;
    const val = rest.join(":").trim();
    const col = fieldMapping[key.trim()];
    if (col && allowedFields.includes(col)) {
      result[col as keyof ParsedItemData] = val === "" || val === "אין נתון" ? null : val;
    }
  });
  return result;
}

function parseJsonObjects(block: string): ParsedItemData[] {
  const matches = block.match(/{[\s\S]*?}/g) ?? [];
  return matches
    .map((m) => {
      try {
        return JSON.parse(m);
      } catch {
        return null;
      }
    })
    .filter((o): o is Record<string, unknown> => !!o)
    .map(normalizeJsonRecord);
}

function parseRecords(text: string): ParsedItemData[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.includes("שם מוזהב:")) {
    return trimmed.split(/\n\s*\n/).map(parseFreeForm);
  }

  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try {
      const obj = JSON.parse(trimmed);
      const arr = Array.isArray(obj) ? obj : [obj];
      return arr.map(normalizeJsonRecord);
    } catch {
      return parseJsonObjects(trimmed);
    }
  }
  return [];
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

  /* ---------- fetch / upsert helpers (unchanged) ---------- */
  async function getDefinitionId(rec: ParsedItemData): Promise<string | null> {
    const name = rec.name?.trim();
    if (!name) return null;

    const { data, error: upsertErr } = await supabase
      .from("item_definitions")
      .upsert(
        { name, description: rec.description ?? null, image: rec.image ?? null },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (upsertErr) return null;
    return data?.id ?? null;
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
    const fails: string[] = [];

    for (const rec of records) {
      if (!rec.name?.trim()) {
        fail++;
        fails.push("רשומה חסרת שם מוזהב דולגה.");
        continue;
      }
      const defId = await getDefinitionId(rec);
      if (!defId) {
        fail++;
        fails.push(`שגיאה עם "${rec.name}" (definition).`);
        continue;
      }

      const { data: dup, error: dupErr } = await supabase
        .from("item_listings")
        .select("id")
        .eq("item_id", defId)
        .eq("publisher", rec.publisher ?? null)
        .eq("date", rec.date ?? null)
        .maybeSingle();

      if (dupErr) {
        fail++;
        fails.push(`שגיאה בבדיקת כפילות עבור "${rec.name}".`);
        continue;
      }
      if (dup) {
        fail++;
        fails.push(`"${rec.name}" כבר קיים (כפילות).`);
        continue;
      }

      const { error: insErr } = await supabase.from("item_listings").insert({
        item_id: defId,
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
        admin_id: user.id,
      });

      if (insErr) {
        fail++;
        fails.push(`שגיאה בהוספת "${rec.name}" לטבלת listings.`);
      } else ok++;
    }

    if (ok) setInputData("");

    setMessage(
      `${ok ? `✅ נוספו ${ok}` : ""}${ok && fail ? " • " : ""}${
        fail ? `❌ נכשלו ${fail}` : ""
      }`
    );
    setError(fails.join("\n"));

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

  /* ---------- Access guards ---------- */
  if (isLoading || !sessionInitiallyChecked) {
    return (
      <div className="admin-post-creation" style={{ marginTop: "2rem", textAlign: "center" }}>
        <h1>מערכת הוספת מוזהבים</h1>
        <p>טוען נתונים…</p>
      </div>
    );
  }

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

  /* -------------------------------------------------
    4️⃣  UI
  -------------------------------------------------- */
  return (
    <div className="admin-post-creation" style={{ marginTop: "2rem" }}>
      <h1>מערכת הוספת מוזהבים</h1>

      {/* --- textarea + inline instructions (restored) --- */}
      <textarea
        value={inputData}
        onChange={(e) => setInputData(e.target.value)}
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
        disabled={isPublishing || !inputData.trim()}
        onClick={handlePublish}
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
