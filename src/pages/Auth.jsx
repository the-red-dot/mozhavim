import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

function Auth() {
  const [isLogin, setIsLogin] = useState(true); // Toggle between login and register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [robloxUsername, setRobloxUsername] = useState(''); // Roblox Username
  const [robloxNickname, setRobloxNickname] = useState(''); // Roblox Nickname
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false); // Toggle forgot password form
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!isLogin) {
      // Validate Roblox fields during registration
      if (!robloxUsername.trim() || !robloxNickname.trim()) {
        setError('שם המשתמש ושם הכינוי ברובלוקס הם שדות חובה.');
        return;
      }
    }

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
        navigate('/');
      } else {
        // Register
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          isAdmin: false,
          robloxUsername: robloxUsername.trim(),
          robloxNickname: robloxNickname.trim(),
        });
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('נשלח אימייל לאיפוס סיסמה!');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container">
      {showForgotPassword ? (
        <>
          <h2>שכחתי סיסמה</h2>
          <form onSubmit={handleForgotPassword}>
            <input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit">שלח אימייל לאיפוס</button>
          </form>
          <div className="auth-buttons">
            <button onClick={() => setShowForgotPassword(false)}>חזור</button>
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
        </>
      ) : (
        <>
          <h2>{isLogin ? 'התחבר' : 'הירשם'}</h2>
          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!isLogin && (
              <>
                <input
                  type="text"
                  placeholder="שם המשתמש ברובלוקס"
                  value={robloxUsername}
                  onChange={(e) => setRobloxUsername(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="שם כינוי ברובלוקס"
                  value={robloxNickname}
                  onChange={(e) => setRobloxNickname(e.target.value)}
                  required
                />
              </>
            )}
            <button type="submit">{isLogin ? 'התחבר' : 'הירשם'}</button>
          </form>
          <div className="auth-buttons">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setRobloxUsername('');
                setRobloxNickname('');
                setError('');
              }}
            >
              {isLogin ? 'אין לך חשבון? הירשם' : 'כבר יש לך חשבון? התחבר'}
            </button>
            {isLogin && (
              <button onClick={() => setShowForgotPassword(true)}>שכחתי סיסמה</button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}

export default Auth;