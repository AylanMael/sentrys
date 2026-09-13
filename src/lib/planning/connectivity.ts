type ConnectivityTarget = {
  navigator: { onLine: boolean };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export function tenantSnapshotItems<T>(snapshot: { tenantId: string; items: T[] } | null, tenantId: string | null | undefined): T[] {
  return snapshot && tenantId && snapshot.tenantId === tenantId ? snapshot.items : [];
}

/** Browser connectivity is a veto, never proof that Firestore is reachable. */
export function observePlanningConnectivity(target: ConnectivityTarget, update: (online: boolean) => void) {
  const offline = () => update(false);
  const online = () => update(target.navigator.onLine);
  target.addEventListener('offline', offline);
  target.addEventListener('online', online);
  online();
  return () => {
    target.removeEventListener('offline', offline);
    target.removeEventListener('online', online);
  };
}
