import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

function SideMenu({ isOpen, setIsOpen }) {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
    navigate('/');
  };

  return (
    <div className={`side-menu ${isOpen ? 'open' : ''}`}>
      <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
      <nav>
        <Link to="/" onClick={() => setIsOpen(false)}>בית</Link>
        <Link to="/info-updates" onClick={() => setIsOpen(false)}>מידע ועדכונים</Link>
        {currentUser ? (
          <>
            {userRole === 'admin' && (
              <Link to="/admin" onClick={() => setIsOpen(false)}>ניהול</Link>
            )}
            <button onClick={handleLogout}>התנתק</button>
          </>
        ) : (
          <Link to="/auth" onClick={() => setIsOpen(false)}>התחבר/הרשם</Link>
        )}
      </nav>
    </div>
  );
}

export default SideMenu;