import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from '@/contexts/AuthContext';
import { IndustryProvider } from '@/contexts/IndustryContext';

createRoot(document.getElementById("root")!).render(
  <IndustryProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </IndustryProvider>
);
