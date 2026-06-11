import { AuthProvider, useAuth } from "./context/Authcontext";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-logo">
          <span className="logo-icon spin">⚕</span>
          <span className="logo-text">DoctorBot<span className="logo-ai">AI</span></span>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  return <ChatPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}