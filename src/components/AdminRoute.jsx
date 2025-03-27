import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

function AdminRoute({ children }) {
  const { userRole } = useAuth();
  return userRole === 'admin' ? children : <Navigate to="/" />;
}

export default AdminRoute;