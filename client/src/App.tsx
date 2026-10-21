import { AuthProvider } from './auth/AuthContext';
import { AppRoutes } from './AppRoutes';
import './styles.css';

/** Needs a router above it (BrowserRouter in main.tsx, MemoryRouter in tests). */
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
