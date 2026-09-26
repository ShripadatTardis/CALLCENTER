import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from '@/contexts/AuthContext';
import { IndustryProvider } from '@/contexts/IndustryContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <IndustryProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </IndustryProvider>
  </ThemeProvider>
);
