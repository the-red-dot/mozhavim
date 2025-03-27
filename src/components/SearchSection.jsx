// SearchSection.jsx
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import PriceOpinion from './PriceOpinion';

// נורמליזציה של מחרוזות
const normalize = (str) => {
  return str.toLowerCase().replace(/[^א-תa-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
};

// חישוב מרחק Levenshtein
const levenshteinDistance = (a, b) => {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[b.length][a.length];
};

// בדיקת דמיון
const isSimilar = (search, itemName) => {
  const normSearch = normalize(search);
  const normItem = normalize(itemName);
  const distance = levenshteinDistance(normSearch, normItem);
  const maxLen = Math.max(normSearch.length, normItem.length);
  const similarity = 1 - distance / maxLen;
  return similarity >= 0.85;
};

function SearchSection() {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [overallAverage, setOverallAverage] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [tempValues, setTempValues] = useState({});
  const [error, setError] = useState('');
  const { currentUser } = useAuth();
  const [selectedItemName, setSelectedItemName] = useState(null);

  // טעינת פריטים מ-Firestore
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'items'));
        const itemsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(itemsData);
      } catch (err) {
        console.error('Error fetching items:', err);
        setError('שגיאה בטעינת הפריטים. אנא נסה שוב מאוחר יותר.');
      }
    };
    fetchItems();
  }, []);

  // בדיקת סטטוס מנהל
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (currentUser) {
        const userDoc = await getDocs(collection(db, 'users'));
        const userData = userDoc.docs.find(doc => doc.id === currentUser.uid)?.data();
        setIsAdmin(userData?.isAdmin === true);
      } else {
        setIsAdmin(false);
      }
    };
    checkAdminStatus();
  }, [currentUser]);

  // פונקציית חיפוש
  const searchItems = (searchKeyword) => {
    if (!items.length || !searchKeyword.trim()) {
      setFilteredItems([]);
      setOverallAverage(null);
      setSelectedItemName(null);
      return;
    }
    const filtered = items.filter(item => isSimilar(searchKeyword, item.name));
    if (filtered.length > 0) {
      setFilteredItems(filtered);
      const average = calculateAverage(filtered);
      setOverallAverage(average);
      setSelectedItemName(filtered[0].name);
    } else {
      setFilteredItems([]);
      setOverallAverage(null);
      setSelectedItemName(null);
    }
  };

  const handleSearch = () => searchItems(keyword);
  const handleKeyUp = (e) => {
    if (e.key === 'Enter') searchItems(e.target.value);
  };

  // ניתוח מחירים
  function parsePrice(priceStr) {
    if (!priceStr) return null;
    const trimmedStr = priceStr.trim().toLowerCase();
    const cleanedStr = trimmedStr.replace('+', '').trim();
    const hasMillion = cleanedStr.includes('מיליון');
    const match = cleanedStr.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const num = parseFloat(match[0]);

    if (hasMillion) return num * 1000000;
    else if (num < 10) return num * 1000000;
    else if (num < 1000) return num * 1000;
    else return num;
  }

  // חישוב ממוצע
  function calculateAverage(items) {
    if (items.length === 0) return null;
    const uniquePrices = new Set();
    items.forEach(item => {
      const price = parsePrice(item.buyRegular);
      if (price !== null) uniquePrices.add(price);
    });
    if (uniquePrices.size === 0) return null;
    const sum = [...uniquePrices].reduce((a, b) => a + b, 0);
    return Math.round(sum / uniquePrices.size);
  }

  // התחלת עריכת פריט
  const startEditing = (item) => {
    const buyFields = Object.keys(item).filter(key => key.startsWith('buy'));
    const temp = {};
    buyFields.forEach(field => {
      temp[field] = item[field] || '';
    });
    setTempValues(temp);
    setEditingItemId(item.id);
  };

  // ביטול עריכה
  const cancelEdit = () => {
    setEditingItemId(null);
    setTempValues({});
  };

  // שמירת פריט ערוך
  const saveEdit = async (itemId) => {
    try {
      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, tempValues);
      setItems(items.map(item => (item.id === itemId ? { ...item, ...tempValues } : item)));
      setFilteredItems(filteredItems.map(item => (item.id === itemId ? { ...item, ...tempValues } : item)));
      setEditingItemId(null);
      setTempValues({});
    } catch (err) {
      console.error('Error updating item:', err);
      setError('שגיאה בעדכון הפריט.');
    }
  };

  // מיפוי תוויות
  const buyLabels = {
    buyRegular: 'קנייה (רגיל)',
    buyGold: 'קנייה (זהב)',
    buyDiamond: 'קנייה (יהלום)',
    buyEmerald: 'קנייה (אמרלד)',
  };

  return (
    <div className="search-section">
      <h1>דף חיפוש</h1>
      <div className="search-bar">
        <input
          type="text"
          placeholder="חפש פריט..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyUp={handleKeyUp}
        />
        <button onClick={handleSearch}>חפש</button>
      </div>

      {filteredItems.length > 0 && selectedItemName && (
        <div className="average-price">
          {overallAverage !== null ? (
            <h2>מחיר ממוצע דיסקורד: {overallAverage.toLocaleString()}</h2>
          ) : (
            <p>אין נתונים לחישוב ממוצע בדיסקורד.</p>
          )}
          <h2>מחיר ממוצע האתר: <span>יקבע בעתיד</span></h2>
          {overallAverage !== null && (
            <PriceOpinion itemName={selectedItemName} discordAverage={overallAverage} />
          )}
        </div>
      )}

      <div className="results">
        {error && <p className="error">{error}</p>}
        {items.length === 0 && !error && <p>לא נמצאו נתונים. על המנהל להעלות תחילה!</p>}
        {keyword && filteredItems.length === 0 && <p>לא נמצאו פריטים תואמים.</p>}
        {filteredItems.map(item => (
          <div key={item.id} className="item-result">
            <p><strong>שם מוזהב:</strong> {item.name}</p>
            {editingItemId === item.id && isAdmin ? (
              Object.keys(tempValues).map(key => (
                <p key={key}>
                  <strong>{buyLabels[key]}:</strong>
                  <input
                    type="text"
                    value={tempValues[key]}
                    onChange={(e) => setTempValues({ ...tempValues, [key]: e.target.value })}
                  />
                </p>
              ))
            ) : (
              Object.keys(item)
                .filter(key => key.startsWith('buy') && item[key])
                .map(key => (
                  <p key={key}>
                    <strong>{buyLabels[key]}:</strong> {item[key]}
                  </p>
                ))
            )}
            {item.sellRegular && <p><strong>מכירה (רגיל):</strong> {item.sellRegular}</p>}
            {item.sellGold && <p><strong>מכירה (זהב):</strong> {item.sellGold}</p>}
            {item.sellDiamond && <p><strong>מכירה (יהלום):</strong> {item.sellDiamond}</p>}
            {item.sellEmerald && <p><strong>מכירה (אמרלד):</strong> {item.sellEmerald}</p>}
            <p><strong>פורסם ע"י:</strong> {item.publisher}</p>
            <p><strong>תאריך פרסום:</strong> {item.date}</p>
            {isAdmin && editingItemId !== item.id && (
              <button onClick={() => startEditing(item)}>ערוך</button>
            )}
            {isAdmin && editingItemId === item.id && (
              <div>
                <button onClick={() => saveEdit(item.id)}>שמור</button>
                <button onClick={cancelEdit}>ביטול</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchSection;