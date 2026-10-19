import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from '@/contexts/AuthContext';
import { IndustryProvider } from '@/contexts/IndustryContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CustomerSkinProvider } from '@/contexts/CustomerSkinContext';
import { DatasetModeProvider } from '@/contexts/DatasetModeContext';

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    {/* Session 7.12 — mounted inside ThemeProvider (needs resolvedTheme)
        and outside everything else (applies before the rest of the app
        renders; purely a presentation layer, no auth/tenant/data
        dependency). */}
    <CustomerSkinProvider>
      <IndustryProvider>
        <AuthProvider>
          {/* Session 7.1 — inside AuthProvider: needs the resolved user's
              permissions to gate TEST mode. */}
          <DatasetModeProvider>
            <App />
          </DatasetModeProvider>
        </AuthProvider>
      </IndustryProvider>
    </CustomerSkinProvider>
  </ThemeProvider>
);
