import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [lastAddress, setLastAddress] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState([]);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api('/me');
      setUser(me.user); setLastAddress(me.last_address); setCartCount(me.cart_count);
    } catch {
      setUser(null); setCartCount(0);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    api('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, [refresh]);

  const notify = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToast({ id, message, kind });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 3500);
  }, []);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null); setCartCount(0); setLastAddress(null);
  };

  return (
    <Ctx.Provider value={{ user, setUser, ready, refresh, lastAddress, cartCount, setCartCount, categories, logout, notify, toast }}>
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
