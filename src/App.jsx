import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Auth from './pages/Auth.jsx';
import Admin from './pages/Admin.jsx';
import InfoUpdates from './pages/InfoUpdates.jsx';
import ItemVotesDetail from './pages/ItemVotesDetail.jsx'; // Import new page

function App() {
  return (
    <Router>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/info-updates" element={<InfoUpdates />} />
            <Route path="/item-votes/:itemName" element={<ItemVotesDetail />} /> {/* New route */}
          </Routes>
        </Layout>
      </AuthProvider>
    </Router>
  );
}

export default App;