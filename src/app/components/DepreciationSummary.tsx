// src/app/components/DepreciationSummary.tsx
"use client";

import React from 'react';

export interface DepreciationStatsDisplay {
  total_items_from_source: number;
  items_with_valid_regular_price: number;
  average_gold_depreciation: number | null;
  gold_items_count: number;
  average_diamond_depreciation: number | null;
  diamond_items_count: number;
  average_emerald_depreciation: number | null;
  emerald_items_count: number;
  updated_at?: string;
}

export type StatsSourceType = 'DATABASE' | 'NEWLY CALCULATED' | 'DATABASE (STALE - ITEM FETCH FAILED)' | 'DEFAULT (ERROR/NO DATA)';

interface DepreciationSummaryProps {
  stats: DepreciationStatsDisplay | undefined | null; // Allow stats to be potentially undefined or null
  source: StatsSourceType | undefined;
}

const DepreciationSummary: React.FC<DepreciationSummaryProps> = ({ stats, source }) => {
  // Guard clause for missing stats or source
  if (!stats || !source) {
    console.error("DepreciationSummary: 'stats' or 'source' prop is missing or undefined.", { stats, source });
    // Optionally, render a specific message or nothing.
    // For debugging, showing an error is helpful. For production, you might return null.
    return (
      <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ff8a80', borderRadius: '12px', backgroundColor: '#ffebee', color: '#c62828', textAlign: 'center', fontFamily: '"Assistant", Arial, sans-serif', maxWidth: '600px', marginRight: 'auto', marginLeft: 'auto' }}>
        נתוני סיכום פחת אינם זמינים כרגע.
      </div>
    );
  }

  const formatPercentage = (value: number | null) => {
    if (value === null || typeof value === 'undefined' || isNaN(value)) {
      return 'N/A';
    }
    return value.toFixed(2);
  };

  return (
    <div style={{
      marginTop: '30px',
      padding: '20px',
      border: '1px solid #383838',
      borderRadius: '12px',
      backgroundColor: '#1f1f1f',
      fontSize: '0.95em',
      color: '#e0e0e0',
      fontFamily: '"Assistant", Arial, sans-serif',
      maxWidth: '600px',
      marginRight: 'auto',
      marginLeft: 'auto',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    }}>
      <h3 style={{
        marginTop: '0',
        marginBottom: '15px',
        borderBottom: '1px solid #4a4a4a',
        paddingBottom: '12px',
        color: '#81d4fa',
        fontSize: '1.3em',
        textAlign: 'center',
      }}>
        📊 סיכום פחת ממוצע כללי
      </h3>
      <p style={{ marginBottom: '8px' }}>
        <strong style={{ color: '#b0b0b0' }}>מקור הנתונים:</strong>
        <span style={{ color: '#ffffff', fontWeight: '500', marginRight: '5px' }}>{source}</span>
      </p>
      <p style={{ marginBottom: '8px' }}>
        <strong style={{ color: '#b0b0b0' }}>סה״כ פריטים מהמקור:</strong>
        <span style={{ color: '#ffffff', fontWeight: '500', marginRight: '5px' }}>{stats.total_items_from_source.toLocaleString()}</span>
      </p>
      <p style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#b0b0b0' }}>פריטים עם מחיר רגיל תקין לחישוב:</strong>
        <span style={{ color: '#ffffff', fontWeight: '500', marginRight: '5px' }}>{stats.items_with_valid_regular_price.toLocaleString()}</span>
      </p>

      <div style={{ borderTop: '1px dashed #444', paddingTop: '12px', marginTop: '12px' }}>
        <p style={{ marginBottom: '8px' }}>
          <strong style={{ color: '#b0b0b0' }}>🥇 ירידת ערך לזהב ממוצע:</strong>
          <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '1.05em', marginRight: '5px' }}>
            {formatPercentage(stats.average_gold_depreciation)}%
          </span>
          (מתוך <span style={{ color: '#ffffff', fontWeight: '500' }}>{stats.gold_items_count.toLocaleString()}</span> פריטים)
        </p>
        <p style={{ marginBottom: '8px' }}>
          <strong style={{ color: '#b0b0b0' }}>💎 ירידת ערך ליהלום ממוצע:</strong>
          <span style={{ color: '#b9f2ff', fontWeight: 'bold', fontSize: '1.05em', marginRight: '5px' }}>
            {formatPercentage(stats.average_diamond_depreciation)}%
          </span>
          (מתוך <span style={{ color: '#ffffff', fontWeight: '500' }}>{stats.diamond_items_count.toLocaleString()}</span> פריטים)
        </p>
        <p style={{ marginBottom: '8px' }}>
          <strong style={{ color: '#b0b0b0' }}>✳️ ירידת ערך לאמרלד ממוצע:</strong>
          <span style={{ color: '#50c878', fontWeight: 'bold', fontSize: '1.05em', marginRight: '5px' }}>
            {formatPercentage(stats.average_emerald_depreciation)}%
          </span>
          (מתוך <span style={{ color: '#ffffff', fontWeight: '500' }}>{stats.emerald_items_count.toLocaleString()}</span> פריטים)
        </p>
      </div>

      {stats.updated_at && (
        <p style={{
          fontSize: '0.85em',
          color: '#999',
          borderTop: '1px dashed #444',
          paddingTop: '12px',
          marginTop: '15px',
          textAlign: 'center',
        }}>
          <small>
            עודכן לאחרונה: {new Date(stats.updated_at).toLocaleString('he-IL', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            })}
          </small>
        </p>
      )}
    </div>
  );
};

export default DepreciationSummary;