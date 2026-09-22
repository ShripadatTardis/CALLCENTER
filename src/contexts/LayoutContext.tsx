
import React, { createContext, useContext } from 'react';

interface LayoutContextType {
  hasLayout: boolean;
}

const LayoutContext = createContext<LayoutContextType>({ hasLayout: false });

export const useLayout = () => useContext(LayoutContext);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <LayoutContext.Provider value={{ hasLayout: true }}>
      {children}
    </LayoutContext.Provider>
  );
};
