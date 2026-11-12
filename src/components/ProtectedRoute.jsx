import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingSpinner message="Verifying institutional credentials..." />
  }

  // Not authenticated
  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Inactive account check
  if (profile.is_active === false) {
    return (
      <Navigate
        to="/login"
        state={{
          error: 'Your account has been deactivated. Please contact your college administrator.',
        }}
        replace
      />
    )
  }

  // Role authorization check
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
