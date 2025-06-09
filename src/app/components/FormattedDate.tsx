// src/app/components/FormattedDate.tsx
"use client";

import React from "react";

interface FormattedDateProps {
  /** Can be a raw date‐string (various patterns) or a Date object */
  date: string | Date;
  /** If true, appends " HH:mm" after the date */
  showTime?: boolean;
}

/**
 * Parses a variety of date formats and renders them as DD/MM/YYYY
 * (with optional " HH:mm").
 */
export default function FormattedDate({
  date,
  showTime = false,
}: FormattedDateProps) {
  let dt: Date | null = null;

  // If it's already a Date…
  if (date instanceof Date) {
    dt = date;
  } else {
    dt = parseDateString(date);
  }

  if (!dt || isNaN(dt.getTime())) {
    // Fallback to raw if parsing fails
    return <>{date}</>;
  }

  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const datePart = `${dd}/${mm}/${yyyy}`;

  if (!showTime) {
    return <>{datePart}</>;
  }

  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return (
    <>
      {datePart} {hh}:{min}
    </>
  );
}

function parseDateString(raw: string): Date | null {
  const s = raw.trim();
  let m: RegExpMatchArray | null;

  // 1) MM/DD/YY, H:MM AM/PM
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    const [, M, D, Y, h, min, ap] = m;
    const year = 2000 + parseInt(Y, 10);
    const month = parseInt(M, 10) - 1;
    const day = parseInt(D, 10);
    const hour = (parseInt(h, 10) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0);
    const minute = parseInt(min, 10);
    return new Date(year, month, day, hour, minute);
  }

  // 2) MM/DD/YYYY, H:MM AM/PM
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    const [, M, D, Y, h, min, ap] = m;
    const year = parseInt(Y, 10);
    const month = parseInt(M, 10) - 1;
    const day = parseInt(D, 10);
    const hour = (parseInt(h, 10) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0);
    const minute = parseInt(min, 10);
    return new Date(year, month, day, hour, minute);
  }

  // 3) YYYY-MM-DD, HH:MM (24h)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2}),\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    const [, Y, M, D, h, min] = m;
    return new Date(
      parseInt(Y, 10),
      parseInt(M, 10) - 1,
      parseInt(D, 10),
      parseInt(h, 10),
      parseInt(min, 10)
    );
  }

  // 4) MM/DD/YY   or   MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, M, D, Y] = m;
    const year =
      Y.length === 2 ? 2000 + parseInt(Y, 10) : parseInt(Y, 10);
    return new Date(year, parseInt(M, 10) - 1, parseInt(D, 10));
  }

  // 5) YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, Y, M, D] = m;
    return new Date(
      parseInt(Y, 10),
      parseInt(M, 10) - 1,
      parseInt(D, 10)
    );
  }

  // 6) Fallback to native parser
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}
