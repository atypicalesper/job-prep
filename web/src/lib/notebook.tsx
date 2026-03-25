'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface NotebookContextValue {
  notebook: boolean;
  toggleNotebook: () => void;
}

const NotebookContext = createContext<NotebookContextValue>({
  notebook: false,
  toggleNotebook: () => {},
});

export function NotebookProvider({ children }: { children: React.ReactNode }) {
  const [notebook, setNotebook] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('notebook-mode') === 'true') setNotebook(true);
  }, []);

  const toggleNotebook = () =>
    setNotebook(v => {
      localStorage.setItem('notebook-mode', String(!v));
      return !v;
    });

  return (
    <NotebookContext.Provider value={{ notebook, toggleNotebook }}>
      {children}
    </NotebookContext.Provider>
  );
}

export function useNotebook() {
  return useContext(NotebookContext);
}
