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

const fieldMapping: Record<string, keyof ParsedItemData> = {
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
    for (const allowed of allowedFields) {
      if (allowed === key) {
        out[allowed] =
          rawVal === "" || rawVal === "אין נתון" || rawVal == null
            ? null
            : String(rawVal);
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
    const key = label.trim();
    const mapped = fieldMapping[key];
    if (mapped && allowedFields.has(mapped)) {
      const val = rest.join(":").trim();
      out[mapped] = val === "" || val === "אין נתון" ? null : val;
    }
  });
  return out;
}

function parseJsonObjects(block: string): ParsedItemData[] {
  const matches = block.match(/{[\s\S]*?}/g) || [];
  return matches
    .map((str) => {
      try { return JSON.parse(str); } catch { return null; }
    })
    .filter((o): o is Record<string, unknown> => Boolean(o))
    .map(normalizeJsonRecord);
}

function parseRecords(text: string): ParsedItemData[] {
  const t = text.trim();
  if (!t) return [];

  if (t.includes("שם מוזהב:")) {
    return t.split(/\n\s*\n/).map(parseFreeForm);
  }

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

  /** Upsert definition & return its ID */
  async function getDefinitionId(rec: ParsedItemData): Promise<string | null> {
    const nm = rec.name?.trim();
    if (!nm) return null;

    const { data, error: upsertErr } = await supabase
      .from("item_definitions")
      .upsert(
        { name: nm, description: rec.description || null, image: rec.image || null },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (upsertErr || !data) return null;
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

    let ok = 0, fail = 0;
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
        failMsgs.push(`שגיאה בבדיקת כפילות עבור "${rec.name}".`);
        continue;
      }
      if (dup) {
        fail++;
        failMsgs.push(`"${rec.name}" כבר קיים (כפילות).`);
        continue;
      }

      const { error: insErr } = await supabase.from("item_listings").insert({
        item_id:      defId,
        publisher:    rec.publisher || null,
        buyregular:   rec.buyregular   || null,
        buygold:      rec.buygold      || null,
        buydiamond:   rec.buydiamond   || null,
        buyemerald:   rec.buyemerald   || null,
        sellregular:  rec.sellregular  || null,
        sellgold:     rec.sellgold     || null,
        selldiamond:  rec.selldiamond  || null,
        sellemerald:  rec.sellemerald  || null,
        date:         rec.date         || null,
        admin_id:     user.id,
      });

      if (insErr) {
        fail++;
        failMsgs.push(`שגיאה בהוספת "${rec.name}".`);
      } else {
        ok++;
      }
    }

    if (ok) setInputData("");
    setMessage(
      `${ok ? `✅ נוספו ${ok}` : ""}${ok && fail ? " • " : ""}${fail ? `❌ נכשלו ${fail}` : ""}`
    );
    setError(failMsgs.join("\n"));

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

  // ── Loading guard
  if (isLoading || !sessionInitiallyChecked) {
    return (
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <h1>מערכת הוספת מוזהבים</h1>
        <p>טוען נתונים…</p>
      </div>
    );
  }

  // ── Admin guard
  if (!user || !profile?.is_admin) {
    return (
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <h1>מערכת הוספת מוזהבים</h1>
        <p style={{ color: "#E74C3C" }}>
          {!user ? "עליך להתחבר." : "אין לך הרשאות אדמין."}
        </p>
        {!user && (
          <Link href="/auth" style={{ textDecoration: "underline", color: "#3498DB" }}>
            לדף התחברות
          </Link>
        )}
      </div>
    );
  }

  // ── Main UI
  return (
    <div style={{ margin: "2rem" }}>
      <h1>מערכת הוספת מוזהבים</h1>

      <textarea
        value={inputData}
        onChange={(e) => setInputData(e.target.value)}
        placeholder={`הזן JSON או טקסט חופשי. הפרד רשומות בשורה ריקה.

דוגמה:
שם מוזהב: פריט חדש
קנייה (רגיל): 1000
מכירה (רגיל): 1200
פורסם ע"י: אדמין
תאריך פרסום: 2025-05-17

(שורה ריקה)
שם מוזהב: עוד פריט
קנייה (זהב): 50
מכירה (יהלום): 300`}
        style={{
          width: "100%",
          minHeight: 200,
          padding: 8,
          fontSize: 14,
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      <button
        onClick={handlePublish}
        disabled={isPublishing || !inputData.trim()}
        style={{
          padding: "0.5rem 1rem",
          background: isPublishing || !inputData.trim() ? "#888" : "#2C3E50",
          color: "#fff",
          border: "none",
          cursor: isPublishing || !inputData.trim() ? "not-allowed" : "pointer",
        }}
      >
        {isPublishing ? "מפרסם…" : "פרסם פריטים"}
      </button>

      {message && <p style={{ color: "#27AE60", whiteSpace: "pre-wrap" }}>{message}</p>}
      {error   && <p style={{ color: "#C0392B", whiteSpace: "pre-wrap" }}>{error}</p>}
    </div>
  );
}
