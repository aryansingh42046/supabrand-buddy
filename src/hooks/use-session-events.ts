import { useEffect, useState } from "react";
import { getSessionEvents, subscribeToSessionEvents, type SessionEvent } from "@/lib/session-analytics";

export function useSessionEvents() {
  const [events, setEvents] = useState<SessionEvent[]>(() => getSessionEvents());

  useEffect(() => {
    const syncEvents = () => setEvents(getSessionEvents());
    syncEvents();
    return subscribeToSessionEvents(syncEvents);
  }, []);

  return events;
}