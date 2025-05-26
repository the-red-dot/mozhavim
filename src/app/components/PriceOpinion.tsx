// src/app/components/PriceOpinion.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";

export default function PriceOpinion({
  itemName,
  discordAverage,
}: {
  itemName: string;
  discordAverage: number;
}) {
  const { user } = useUser();

  /* ──────────────── 1. STATE ──────────────── */
  // --- הצבעות
  const [voteCounts, setVoteCounts] = useState({
    reasonable: 0,
    too_low: 0,
    too_high: 0,
  });
  const [userVote, setUserVote] = useState<string | null>(null);
  const [hasVotedRecently, setHasVotedRecently] = useState(false);
  const [nextVoteTime, setNextVoteTime] = useState<Date | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);

  // --- השערת מחיר (טופס)
  const [assumptions, setAssumptions] = useState({
    regular: "",
    gold: "",
    diamond: "",
    emerald: "",
  });

  // --- UI
  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* ──────────────── 2. HELPERS ──────────────── */
  async function loadVoteCounts() {
    const { data, error } = await supabase
      .from("votes")
      .select("vote")
      .eq("item_name", itemName);

    if (error) return console.error("loadVoteCounts:", error.message);

    const counts = { reasonable: 0, too_low: 0, too_high: 0 };
    data?.forEach((v) => {
      if (v.vote === "reasonable") counts.reasonable++;
      if (v.vote === "too_low") counts.too_low++;
      if (v.vote === "too_high") counts.too_high++;
    });
    setVoteCounts(counts);
  }

  async function checkUserVote() {
    if (!user) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("votes")
      .select("vote, created_at")
      .eq("item_name", itemName)
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .maybeSingle();

    if (error) return console.error("checkUserVote:", error.message);

    if (data) {
      setHasVotedRecently(true);
      setUserVote(data.vote);
      const lastTime = new Date(data.created_at);
      setNextVoteTime(new Date(lastTime.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else {
      setHasVotedRecently(false);
      setUserVote(null);
    }
  }

  const pickVote = (type: "reasonable" | "too_low" | "too_high") => {
    if (hasVotedRecently) return;
    setSelectedVote(type);
    setShowForm(true);
  };

  /* ──────────────── 3. CONFIRM ──────────────── */
  async function handleConfirm() {
    setErrorMsg("");
    setSuccessMsg("");

    if (!user) {
      setErrorMsg("עליך להתחבר כדי להצביע.");
      return;
    }
    if (!selectedVote) {
      setErrorMsg("בחר אפשרות הצבעה.");
      return;
    }

    // 3.1  שמירת הצבעה
    if (!hasVotedRecently) {
      const { error } = await supabase.from("votes").insert({
        item_name: itemName,
        user_id: user.id,
        vote: selectedVote,
      });
      if (error) {
        setErrorMsg("שגיאה בשמירת ההצבעה.");
        return;
      }
    }

    // 3.2  עיבוד השערת מחיר (אופציונלי)
    const parseOrNull = (v: string) => (v.trim() ? +v.replace(/,/g, "") : null);
    const reg = parseOrNull(assumptions.regular);
    const gold = parseOrNull(assumptions.gold);
    const dia = parseOrNull(assumptions.diamond);
    const eme = parseOrNull(assumptions.emerald);

    //   בדיקת היגיון בסיסית
    if (discordAverage > 0 && (reg || gold || dia || eme)) {
      const mult = { regular: 1, gold: 4, diamond: 16, emerald: 64 };
      for (const cur of ["regular", "gold", "diamond", "emerald"] as const) {
        const val =
          cur === "regular" ? reg : cur === "gold" ? gold : cur === "diamond" ? dia : eme;
        if (val !== null && !isNaN(val)) {
          const min = 0.3 * discordAverage * mult[cur];
          const max = 2.0 * discordAverage * mult[cur];
          if (val < min || val > max) {
            setErrorMsg(
              `ערך ${cur} לא סביר (טווח מומלץ ${Math.round(min)}-${Math.round(max)})`
            );
            return;
          }
        }
      }
    }

    if (reg !== null || gold !== null || dia !== null || eme !== null) {
      const { error } = await supabase.from("assumptions").insert({
        item_name: itemName,
        user_id: user.id,
        regular: reg,
        gold,
        diamond: dia,
        emerald: eme,
      });
      if (error) {
        setErrorMsg("שגיאה בשמירת ההשערה.");
        return;
      }
    }

    // 3.3  רענון נתונים
    await Promise.all([loadVoteCounts(), checkUserVote()]);

    setSuccessMsg("✅ ההצבעה נשמרה בהצלחה!");
    setAssumptions({ regular: "", gold: "", diamond: "", emerald: "" });
    setShowForm(false);
    setSelectedVote(null);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  /* ──────────────── 4. INIT ──────────────── */
  useEffect(() => {
    loadVoteCounts();
    checkUserVote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemName]);

  /* ──────────────── 5. RENDER ──────────────── */
  return (
    <div className="price-opinion-container">
      <p className="vote-question">האם המחיר נראה לך הגיוני?</p>

      {/* כפתורי הצבעה */}
      <div className="voting-buttons">
        <button
          onClick={() => pickVote("reasonable")}
          disabled={hasVotedRecently}
          className={selectedVote === "reasonable" ? "vote-selected" : ""}
        >
          הגיוני ({voteCounts.reasonable})
        </button>
        <button
          onClick={() => pickVote("too_low")}
          disabled={hasVotedRecently}
          className={selectedVote === "too_low" ? "vote-selected" : ""}
        >
          נמוך מדי ({voteCounts.too_low})
        </button>
        <button
          onClick={() => pickVote("too_high")}
          disabled={hasVotedRecently}
          className={selectedVote === "too_high" ? "vote-selected" : ""}
        >
          גבוה מדי ({voteCounts.too_high})
        </button>
      </div>

      {/* תזכורת הצבעה קודמת */}
      {userVote && (
        <p>
          הצבעת:{" "}
          {userVote === "reasonable"
            ? "המחיר הגיוני"
            : userVote === "too_low"
            ? "נמוך מדי"
            : "גבוה מדי"}
        </p>
      )}
      {hasVotedRecently && nextVoteTime && (
        <p>תוכל להצביע שוב ב-{nextVoteTime.toLocaleString("he-IL")}.</p>
      )}

      {/* טופס השערת מחיר (אופציונלי) */}
      {showForm && (
        <div className="assumption-form">
          <p>הזן הערכת מחיר (לא חובה):</p>

          <label>
            רגיל:
            <input
              type="text"
              value={assumptions.regular}
              onChange={(e) =>
                setAssumptions({ ...assumptions, regular: e.target.value })
              }
            />
          </label>
          <br />
          <label>
            זהב:
            <input
              type="text"
              value={assumptions.gold}
              onChange={(e) =>
                setAssumptions({ ...assumptions, gold: e.target.value })
              }
            />
          </label>
          <br />
          <label>
            יהלום:
            <input
              type="text"
              value={assumptions.diamond}
              onChange={(e) =>
                setAssumptions({ ...assumptions, diamond: e.target.value })
              }
            />
          </label>
          <br />
          <label>
            אמרלד:
            <input
              type="text"
              value={assumptions.emerald}
              onChange={(e) =>
                setAssumptions({ ...assumptions, emerald: e.target.value })
              }
            />
          </label>
          <br />
          <button onClick={handleConfirm}>אישור</button>
        </div>
      )}

      {/* הודעות מערכת */}
      {errorMsg && <p className="error">{errorMsg}</p>}
      {successMsg && <p className="success">{successMsg}</p>}
    </div>
  );
}
