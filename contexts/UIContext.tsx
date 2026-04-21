import React, { createContext, useContext, ReactNode } from 'react';
import { useAppUI } from '../hooks/useAppUI';

interface UIContextType {
  ui: ReturnType<typeof useAppUI>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useAppUI();

  return (
    <UIContext.Provider value={{ ui }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUIContext = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
};
