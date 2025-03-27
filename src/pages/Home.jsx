// src/pages/Home.jsx
import SearchSection from '../components/SearchSection.jsx';

function Home() {
  const googleColors = ['#4285F4', '#EA4335', '#FBBC05', '#4285F4', '#34A853', '#EA4335', '#4285F4'];

  return (
    <div className="homeitives">
      <h1 className="title">
        {'מוזהבים'.split('').map((letter, index) => (
          <span key={index} style={{ color: googleColors[index % googleColors.length] }}>
            {letter}
          </span>
        ))}
      </h1>
      <SearchSection />
    </div>
  );
}

export default Home;