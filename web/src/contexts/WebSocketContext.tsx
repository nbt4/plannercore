import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePlanContext } from './PlanContext';
import { appPath } from '../lib/app-paths';

interface WebSocketContextValue {
  lastEvent: unknown | null;
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  lastEvent: null,
  connected: false,
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { activePlanId } = usePlanContext();
  const [lastEvent, setLastEvent] = useState<unknown | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!activePlanId || activePlanId === 'new') return;

    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let closed = false;

    function connect() {
      if (closed) return;
      ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${appPath(`/api/v1/planner/ws?planId=${activePlanId}`)}`,
      );

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onmessage = (event) => {
        try {
          setLastEvent(JSON.parse(event.data));
        } catch {
          setLastEvent(event.data);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [activePlanId]);

  return (
    <WebSocketContext.Provider value={{ lastEvent, connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
