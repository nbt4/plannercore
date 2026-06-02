import { createContext, useContext, useState, ReactNode } from 'react';

interface WebSocketContextValue {
  lastEvent: unknown | null;
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({ lastEvent: null, connected: false });

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [lastEvent] = useState<unknown | null>(null);
  const [connected] = useState(false);
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
