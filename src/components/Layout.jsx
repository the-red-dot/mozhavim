import { useState } from 'react';
import SideMenu from './SideMenu.jsx';
import EmailVerificationPrompt from './EmailVerificationPrompt.jsx'; // Import the new component
import '../styles.css';

function Layout({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className={`layout ${isMenuOpen ? 'menu-open' : ''}`}>
      <button className="burger-menu" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        ☰
      </button>
      <SideMenu isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
      <EmailVerificationPrompt /> {/* Add the prompt here */}
      <main className="content">{children}</main>
    </div>
  );
}

export default Layout;