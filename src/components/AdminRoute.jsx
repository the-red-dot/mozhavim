import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

function AdminRoute({ children }) {
  const { userRole, isEmailVerified } = useAuth();
  return userRole === 'admin' && isEmailVerified ? children : <Navigate to="/" />;
}

export default AdminRoute;