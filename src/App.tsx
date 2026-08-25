import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './lib/auth';
import AuthCallbackScreen from './screens/AuthCallbackScreen';
import BooksScreen from './screens/BooksScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import DashboardScreen from './screens/DashboardScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import GraphScreen from './screens/GraphScreen';
import LecturersScreen from './screens/LecturersScreen';
import LecturesScreen from './screens/LecturesScreen';
import LoginScreen from './screens/LoginScreen';
import NoteEditorScreen from './screens/NoteEditorScreen';
import SignupScreen from './screens/SignupScreen';
import UpdatePasswordScreen from './screens/UpdatePasswordScreen';

/** Sends authenticated users to /dashboard and guests to /login. */
function RootRedirect(): ReactElement {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-neutral-50"
        role="status"
        aria-live="polite"
      >
        <p className="text-lg text-brand-700">جارٍ التحميل…</p>
      </div>
    );
  }

  return <Navigate replace to={user ? '/dashboard' : '/login'} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900">
        <header className="bg-brand-600 py-4 pe-6 ps-6 shadow-sm">
          <h1 className="text-xl font-bold text-white">تذكرة الطالب</h1>
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/signup" element={<SignupScreen />} />
            <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
            <Route path="/update-password" element={<UpdatePasswordScreen />} />
            <Route path="/auth/callback" element={<AuthCallbackScreen />} />
            <Route
              element={
                <ProtectedRoute>
                  <Outlet />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardScreen />} />
              <Route path="/categories" element={<CategoriesScreen />} />
              <Route path="/categories/:categoryId" element={<BooksScreen />} />
              <Route
                path="/categories/:categoryId/books/:bookId"
                element={<LecturersScreen />}
              />
              <Route
                path="/categories/:categoryId/books/:bookId/lecturers/:lecturerId"
                element={<LecturesScreen />}
              />
              <Route path="/notes/new" element={<NoteEditorScreen />} />
              <Route path="/notes/:noteId" element={<NoteEditorScreen />} />
              <Route path="/graph" element={<GraphScreen />} />
            </Route>
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </main>
        <footer className="pb-4 pe-6 ps-6 pt-2 text-center text-xs text-neutral-500">
          نظام تتبع المذاكرة والمراجعة لطلبة العلوم الشرعية
        </footer>
      </div>
    </BrowserRouter>
  );
}
