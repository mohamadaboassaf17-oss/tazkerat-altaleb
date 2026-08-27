import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './lib/auth';
import { SearchBox } from './components/search-box';
import { InstallPrompt } from './components/install-prompt';

// Eager: auth shell + public share (tiny, SEO-critical)
import AuthCallbackScreen from './screens/AuthCallbackScreen';
import LoginScreen from './screens/LoginScreen';
import ShareNoteScreen from './screens/ShareNoteScreen';
import SignupScreen from './screens/SignupScreen';

// Lazy: protected routes — code-split to eliminate >500 kB main chunk
const BooksScreen = lazy(() => import('./screens/BooksScreen'));
const CategoriesScreen = lazy(() => import('./screens/CategoriesScreen'));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen'));
const ForgotPasswordScreen = lazy(() => import('./screens/ForgotPasswordScreen'));
const GraphScreen = lazy(() => import('./screens/GraphScreen'));
const LecturersScreen = lazy(() => import('./screens/LecturersScreen'));
const LecturesScreen = lazy(() => import('./screens/LecturesScreen'));
const NoteEditorScreen = lazy(() => import('./screens/NoteEditorScreen'));
const ReviewScreen = lazy(() => import('./screens/ReviewScreen'));
const SearchScreen = lazy(() => import('./screens/SearchScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const UpdatePasswordScreen = lazy(() => import('./screens/UpdatePasswordScreen'));

function RouteFallback(): ReactElement {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-live="polite">
      <p className="text-sm text-neutral-500">جارٍ التحميل…</p>
    </div>
  );
}

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
        <a
          href="#main-content"
          className="sr-only z-50 bg-brand-700 px-4 py-2 text-white focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:rounded-lg"
        >
          تخطَّ إلى المحتوى
        </a>
        <header className="bg-brand-600 py-3 pe-6 ps-6 shadow-sm" role="banner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white">تذكرة الطالب</h1>
            <SearchBox />
          </div>
        </header>
        <main id="main-content" className="flex-1">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LoginScreen />} />
              <Route path="/signup" element={<SignupScreen />} />
              <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
              <Route path="/update-password" element={<UpdatePasswordScreen />} />
              <Route path="/auth/callback" element={<AuthCallbackScreen />} />
              <Route path="/share/:noteId" element={<ShareNoteScreen />} />
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
                <Route path="/review" element={<ReviewScreen />} />
                <Route path="/graph" element={<GraphScreen />} />
                <Route path="/search" element={<SearchScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />
              </Route>
              <Route path="*" element={<Navigate replace to="/" />} />
            </Routes>
          </Suspense>
        </main>
        <InstallPrompt />
        <footer className="pb-4 pe-6 ps-6 pt-2 text-center text-xs text-neutral-500">
          نظام تتبع المذاكرة والمراجعة لطلبة العلوم الشرعية
        </footer>
      </div>
    </BrowserRouter>
  );
}
