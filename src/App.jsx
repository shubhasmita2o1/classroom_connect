import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoadingSpinner from './components/LoadingSpinner'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard'))
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'))

// Root redirector based on authenticated role
function RootRedirect() {
  const { user, profile, role, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner message="Checking institutional credentials..." />
  }

  if (!user || !profile || profile.is_active === false) {
    return <Navigate to="/login" replace />
  }

  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'faculty') return <Navigate to="/faculty" replace />
  if (role === 'student') return <Navigate to="/student" replace />

  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner message="Loading institutional view..." />}>
          <Routes>
            {/* Public Authentication Route */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Root Redirect */}
            <Route path="/" element={<RootRedirect />} />

            {/* Protected Role-Specific Dashboards */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/faculty/*"
              element={
                <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                  <FacultyDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/student/*"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />

            {/* Catch-all 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
