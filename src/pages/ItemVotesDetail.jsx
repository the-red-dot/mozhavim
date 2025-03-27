// ItemVotesDetail.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

function ItemVotesDetail() {
  const { itemName } = useParams();
  const [votes, setVotes] = useState([]);
  const [assumptions, setAssumptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currencyLabels = {
    regular: 'רגיל',
    gold: 'זהב',
    diamond: 'יהלום',
    emerald: 'אמרלד'
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch votes
        const votesQuery = query(collection(db, 'votes'), where('itemName', '==', itemName));
        const votesSnapshot = await getDocs(votesQuery);
        const votesData = votesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch assumptions
        const assumptionsQuery = query(collection(db, 'assumptions'), where('itemName', '==', itemName));
        const assumptionsSnapshot = await getDocs(assumptionsQuery);
        const assumptionsData = assumptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setVotes(votesData);
        setAssumptions(assumptionsData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('שגיאה בטעינת הנתונים.');
        setLoading(false);
      }
    };

    fetchData();
  }, [itemName]);

  if (loading) {
    return <p>טוען נתונים...</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  return (
    <div>
      <h2>פרטי הצבעות והשערות עבור "{itemName}"</h2>

      <h3>הצבעות</h3>
      {votes.length > 0 ? (
        <ul>
          {votes.map(vote => (
            <li key={vote.id}>
              <p><strong>משתמש:</strong> {vote.username || 'משתמש לא ידוע'}</p>
              <p>
                <strong>הצבעה:</strong>{' '}
                {vote.vote === 'reasonable' ? 'המחיר הגיוני' : vote.vote === 'too_low' ? 'המחיר נמוך מדי' : 'המחיר גבוה מדי'}
              </p>
              <p><strong>תאריך:</strong> {vote.timestamp.toDate().toLocaleString('he-IL')}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>אין הצבעות זמינות.</p>
      )}

      <h3>השערות מחיר</h3>
      {assumptions.length > 0 ? (
        <ul>
          {assumptions.map(assumption => (
            <li key={assumption.id}>
              <p><strong>משתמש:</strong> {assumption.username || 'משתמש לא ידוע'}</p>
              <p><strong>תאריך:</strong> {assumption.timestamp.toDate().toLocaleString('he-IL')}</p>
              {Object.entries(assumption.prices).map(([currency, price]) => (
                price !== null && (
                  <p key={currency}>
                    <strong>{currencyLabels[currency]}:</strong> {price.toLocaleString()}
                  </p>
                )
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p>אין השערות זמינות.</p>
      )}
    </div>
  );
}

export default ItemVotesDetail;