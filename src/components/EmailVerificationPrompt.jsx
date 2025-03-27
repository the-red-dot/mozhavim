import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { auth } from '../firebase';
import { sendEmailVerification } from 'firebase/auth';

function EmailVerificationPrompt() {
  const { currentUser, isEmailVerified } = useAuth();
  const [isOpen, setIsOpen] = useState(!isEmailVerified);

  // Automatically close the modal when the email is verified
  useEffect(() => {
    if (isEmailVerified) {
      setIsOpen(false);
    }
  }, [isEmailVerified]);

  // Don’t render anything if there’s no user or the email is verified
  if (!currentUser || isEmailVerified) {
    return null;
  }

  // Handle resending the verification email
  const handleResend = async () => {
    try {
      await sendEmailVerification(auth.currentUser);
      alert('נשלח אימייל אימות מחדש.');
    } catch (err) {
      alert('שגיאה בשליחת אימייל האימות: ' + err.message);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <p>נא לאמת את כתובת האימייל שלך כדי לגשת לכל התכונות. בדוק את תיבת הדואר שלך.</p>
            <button onClick={handleResend}>שלח שוב אימייל אימות</button>
            <button onClick={() => setIsOpen(false)}>סגור</button>
          </div>
        </div>
      )}
    </>
  );
}

export default EmailVerificationPrompt;