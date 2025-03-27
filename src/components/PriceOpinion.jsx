// PriceOpinion.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';

function PriceOpinion({ itemName, discordAverage }) {
  const { currentUser } = useAuth();
  const [vote, setVote] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [nextVoteTime, setNextVoteTime] = useState(null); // מצב חדש לזמן ההצבעה הבאה
  const [voteCounts, setVoteCounts] = useState({ reasonable: 0, too_low: 0, too_high: 0 });
  const [assumptions, setAssumptions] = useState({
    regular: '',
    gold: '',
    diamond: '',
    emerald: ''
  });
  const [showAssumptionInput, setShowAssumptionInput] = useState(false);
  const [userAverage, setUserAverage] = useState(null);
  const [error, setError] = useState('');

  // יחסי המרה בין סוגי המטבעות
  const currencyRatios = {
    regular: 1,
    gold: 4,    // זהב = 4 רגילים
    diamond: 16, // יהלום = 16 רגילים
    emerald: 64  // אמרלד = 64 רגילים
  };

  // תוויות עבור סוגי המטבעות
  const currencyLabels = {
    regular: 'רגיל',
    gold: 'זהב',
    diamond: 'יהלום',
    emerald: 'אמרלד'
  };

  // בדיקת האם המשתמש הצביע בשבוע האחרון וחישוב הזמן להצבעה הבאה
  const checkUserVote = async () => {
    if (!currentUser) return;
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'votes'),
      where('itemName', '==', itemName),
      where('userId', '==', currentUser.uid),
      where('timestamp', '>', oneWeekAgo),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      setHasVoted(true);
      const lastVoteTimestamp = snapshot.docs[0].data().timestamp.toDate();
      const nextVoteDate = new Date(lastVoteTimestamp.getTime() + 7 * 24 * 60 * 60 * 1000);
      setNextVoteTime(nextVoteDate);
    } else {
      setHasVoted(false);
      setNextVoteTime(null);
    }
  };

  // טעינת ספירת ההצבעות עבור הפריט
  const fetchVoteCounts = async () => {
    const q = query(collection(db, 'votes'), where('itemName', '==', itemName));
    const snapshot = await getDocs(q);
    const counts = { reasonable: 0, too_low: 0, too_high: 0 };
    snapshot.forEach(doc => {
      const data = doc.data();
      counts[data.vote]++;
    });
    setVoteCounts(counts);
  };

  // טעינת השערות מחיר וחישוב ממוצע אם יש לפחות 3
  const fetchUserAverage = async () => {
    const q = query(collection(db, 'assumptions'), where('itemName', '==', itemName));
    const snapshot = await getDocs(q);
    const regularPrices = snapshot.docs.map(doc => doc.data().prices.regular).filter(p => p !== null);
    if (regularPrices.length >= 3) {
      const sum = regularPrices.reduce((a, b) => a + b, 0);
      const average = Math.round(sum / regularPrices.length);
      setUserAverage(average);
    } else {
      setUserAverage(null);
    }
  };

  // טעינת נתונים ראשוניים
  useEffect(() => {
    checkUserVote();
    fetchVoteCounts();
    fetchUserAverage();
  }, [itemName, currentUser]);

  // טיפול בלחיצה על כפתורי ההצבעה
  const handleVote = async (selectedVote) => {
    if (!currentUser) {
      alert('עליך להירשם כדי להצביע.');
      return;
    }
    if (hasVoted) {
      const nextVoteDateStr = nextVoteTime.toLocaleString('he-IL');
      setError(`אתה יכול להצביע שוב רק לאחר ${nextVoteDateStr}.`);
      return;
    }
    try {
      await addDoc(collection(db, 'votes'), {
        itemName,
        userId: currentUser.uid,
        vote: selectedVote,
        timestamp: new Date(),
      });
      setVote(selectedVote);
      setHasVoted(true);
      setShowAssumptionInput(true); // תמיד מציג שדות להזנת השערות
      fetchVoteCounts();
      // עדכון הזמן להצבעה הבאה
      const nextVoteDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setNextVoteTime(nextVoteDate);
    } catch (err) {
      setError('שגיאה בשמירת ההצבעה.');
    }
  };

  // טיפול בשליחת השערות מחיר
  const handleAssumptionSubmit = async () => {
    const prices = {
      regular: assumptions.regular ? parseFloat(assumptions.regular.replace(/,/g, '')) : null,
      gold: assumptions.gold ? parseFloat(assumptions.gold.replace(/,/g, '')) : null,
      diamond: assumptions.diamond ? parseFloat(assumptions.diamond.replace(/,/g, '')) : null,
      emerald: assumptions.emerald ? parseFloat(assumptions.emerald.replace(/,/g, '')) : null,
    };

    if (!prices.regular && !prices.gold && !prices.diamond && !prices.emerald) {
      setError('אנא הזן לפחות מחיר אחד.');
      return;
    }

    // בדיקת תקינות המחירים לפי היחסים
    for (const [currency, price] of Object.entries(prices)) {
      if (price !== null) {
        if (isNaN(price)) {
          setError(`המחיר עבור ${currencyLabels[currency]} חייב להיות מספר.`);
          return;
        }
        // חישוב המחיר הצפוי לפי היחס
        const expectedPrice = discordAverage * currencyRatios[currency];
        const lowerBound = expectedPrice * 0.3; // 30% מהמחיר הצפוי
        const upperBound = expectedPrice * 2.0; // 200% מהמחיר הצפוי
        if (price < lowerBound || price > upperBound) {
          setError(
            `השערת ${currencyLabels[currency]} לא ריאלית. אנא הזן ערך בין ${Math.round(lowerBound).toLocaleString()} ל-${Math.round(upperBound).toLocaleString()}.`
          );
          return;
        }
      }
    }

    try {
      await addDoc(collection(db, 'assumptions'), {
        itemName,
        userId: currentUser.uid,
        prices,
        timestamp: new Date(),
      });
      setAssumptions({ regular: '', gold: '', diamond: '', emerald: '' });
      setShowAssumptionInput(false);
      fetchUserAverage();
    } catch (err) {
      setError('שגיאה בשמירת ההשערה.');
    }
  };

  return (
    <div className="price-opinion">
      <h4>מה דעתך על המחיר הממוצע של "{itemName}" בדיסקורד?</h4>
      {currentUser ? (
        <div className="vote-buttons">
          <button onClick={() => handleVote('reasonable')} disabled={hasVoted}>
            המחיר הגיוני ({voteCounts.reasonable})
          </button>
          <button onClick={() => handleVote('too_low')} disabled={hasVoted}>
            המחיר נמוך מידי ({voteCounts.too_low})
          </button>
          <button onClick={() => handleVote('too_high')} disabled={hasVoted}>
            המחיר גבוה מידי ({voteCounts.too_high})
          </button>
        </div>
      ) : (
        <p>עליך להירשם כדי להצביע.</p>
      )}
      {vote && (
        <p>
          הצבעת: {vote === 'reasonable' ? 'המחיר הגיוני' : vote === 'too_low' ? 'המחיר נמוך מידי' : 'המחיר גבוה מידי'}
        </p>
      )}
      {hasVoted && nextVoteTime && (
        <p>הצבעת כבר השבוע. תוכל להצביע שוב ב-{nextVoteTime.toLocaleString('he-IL')}.</p>
      )}
      {showAssumptionInput && (
        <div>
          <p>מה אתה חושב שצריך להיות המחיר של "{itemName}"? (הזן לפחות סוג מטבע אחד)</p>
          <div>
            <label>רגיל:</label>
            <input
              type="text"
              value={assumptions.regular}
              onChange={(e) => setAssumptions({ ...assumptions, regular: e.target.value })}
              placeholder="לדוגמה: 50,000"
            />
          </div>
          <div>
            <label>זהב:</label>
            <input
              type="text"
              value={assumptions.gold}
              onChange={(e) => setAssumptions({ ...assumptions, gold: e.target.value })}
              placeholder="לדוגמה: 10,000"
            />
          </div>
          <div>
            <label>יהלום:</label>
            <input
              type="text"
              value={assumptions.diamond}
              onChange={(e) => setAssumptions({ ...assumptions, diamond: e.target.value })}
              placeholder="לדוגמה: 5,000"
            />
          </div>
          <div>
            <label>אמרלד:</label>
            <input
              type="text"
              value={assumptions.emerald}
              onChange={(e) => setAssumptions({ ...assumptions, emerald: e.target.value })}
              placeholder="לדוגמה: 2,000"
            />
          </div>
          <button onClick={handleAssumptionSubmit}>שלח</button>
        </div>
      )}
      {userAverage !== null && (
        <h4>חברי האתר מעריכים שמחיר המוזהב של "{itemName}" הוא: {userAverage.toLocaleString()} (רגיל)</h4>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default PriceOpinion;