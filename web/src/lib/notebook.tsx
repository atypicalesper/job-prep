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
    const saved = localStorage.getItem('notebook-mode') === 'true';
    if (saved) setNotebook(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('notebook-mode', notebook);
  }, [notebook]);

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
