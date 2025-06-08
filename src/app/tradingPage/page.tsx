// src/app/tradingPage/page.tsx
import React from 'react';
import '../globals.css'; // Ensures global styles can be applied

const TradingPage = () => {
  return (
    <div className="page-container" style={{ textAlign: 'center' }}> {/* Using existing page-container for general layout and centering text */}
      <h1 className="title">טריידים</h1> {/* Using existing title class */}
      <p style={{ fontSize: '1.2rem', marginTop: '1rem' }}>
        עדכון חדש בקרוב
      </p>
    </div>
  );
};

export default TradingPage;