import React, { createContext, useContext, useState, useEffect } from 'react';
import { store } from '../store.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(() => ({ ...store.state }));

  useEffect(() => {
    const unsubscribe = store.on('stateChange', (nextState) => {
      setState({ ...nextState });
    });
    return unsubscribe;
  }, []);

  return (
    <StoreContext.Provider value={{ state, store }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
