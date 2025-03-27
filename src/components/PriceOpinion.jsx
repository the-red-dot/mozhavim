// PriceOpinion.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';

function PriceOpinion({ itemName, discordAverage }) {
  const { currentUser, isEmailVerified } = useAuth();
  const [vote, setVote] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [nextVoteTime, setNextVoteTime] = useState(null);
  const [voteCounts, setVoteCounts] = useState({ reasonable: 0, too_low: 0, too_high: 0 });
  const [assumptions, setAssumptions] = useState({
    regular: '',
    gold: '',
    diamond: '',
    emerald: ''
  });
  const [showAssumptionInput, setShowAssumptionInput] = useState(false);
  const [userAverages, setUserAverages] = useState({
    regular: null,
    gold: null,
    diamond: null,
    emerald: null
  });
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

  // טעינת השערות מחיר וחישוב ממוצעים עבור כל סוג מטבע אם יש לפחות 3
  const fetchUserAverages = async () => {
    const q = query(collection(db, 'assumptions'), where('itemName', '==', itemName));
    const snapshot = await getDocs(q);
    
    // חילוץ המחירים עבור כל סוג מטבע
    const prices = {
      regular: snapshot.docs.map(doc => doc.data().prices.regular).filter(p => p !== null),
      gold: snapshot.docs.map(doc => doc.data().prices.gold).filter(p => p !== null),
      diamond: snapshot.docs.map(doc => doc.data().prices.diamond).filter(p => p !== null),
      emerald: snapshot.docs.map(doc => doc.data().prices.emerald).filter(p => p !== null),
    };

    // חישוב ממוצעים עבור כל סוג מטבע אם יש לפחות 3 השערות
    const averages = {};
    Object.keys(prices).forEach(currency => {
      if (prices[currency].length >= 3) {
        const sum = prices[currency].reduce((a, b) => a + b, 0);
        averages[currency] = Math.round(sum / prices[currency].length);
      } else {
        averages[currency] = null;
      }
    });

    setUserAverages(averages);
  };

  // טעינת נתונים ראשוניים
  useEffect(() => {
    checkUserVote();
    fetchVoteCounts();
    fetchUserAverages();
  }, [itemName, currentUser]);

  // טיפול בלחיצה על כפתורי ההצבעה
  const handleVote = async (selectedVote) => {
    if (!currentUser) {
      alert('עליך להירשם כדי להצביע.');
      return;
    }
    if (!isEmailVerified) {
      alert('עליך לאמת את כתובת האימייל שלך כדי להצביע.');
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
      setShowAssumptionInput(true);
      fetchVoteCounts();
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

    for (const [currency, price] of Object.entries(prices)) {
      if (price !== null) {
        if (isNaN(price)) {
          setError(`המחיר עבור ${currencyLabels[currency]} חייב להיות מספר.`);
          return;
        }
        const expectedPrice = discordAverage * currencyRatios[currency];
        const lowerBound = expectedPrice * 0.3;
        const upperBound = expectedPrice * 2.0;
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
      fetchUserAverages();
    } catch (err) {
      setError('שגיאה בשמירת ההשערה.');
    }
  };

  return (
    <div className="price-opinion">
      <h4>מה דעתך על המחיר הממוצע של "{itemName}" בדיסקורד?</h4>
      {currentUser && isEmailVerified ? (
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
        <p>עליך להירשם ולאמת את האימייל כדי להצביע.</p>
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
      {/* הצגת ממוצעים עבור כל סוגי המטבעות */}
      {userAverages.regular !== null && (
        <h4>חברי האתר מעריכים שמחיר המוזהב של "{itemName}" הוא: {userAverages.regular.toLocaleString()} (רגיל)</h4>
      )}
      <div className="other-currencies">
        {userAverages.gold !== null && (
          <p>חברי האתר מעריכים שמחיר המוזהב של "{itemName}" הוא: {userAverages.gold.toLocaleString()} (זהב)</p>
        )}
        {userAverages.diamond !== null && (
          <p>חברי האתר מעריכים שמחיר המוזהב של "{itemName}" הוא: {userAverages.diamond.toLocaleString()} (יהלום)</p>
        )}
        {userAverages.emerald !== null && (
          <p>חברי האתר מעריכים שמחיר המוזהב של "{itemName}" הוא: {userAverages.emerald.toLocaleString()} (אמרלד)</p>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default PriceOpinion;