/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

let channelCounter = 0;

export interface TableSubscription<Row extends { [key: string]: any }> {
  table: string;
  /** Called for every INSERT / UPDATE / DELETE the current user is allowed to see. */
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
  /** Called after the socket re-connects, so the caller can re-fetch anything missed while offline. */
  onResync: () => void;
  onError?: (message: string) => void;
}

/** Opens one Realtime channel for a table. Returns a function that closes it. */
export function subscribeToTable<Row extends { [key: string]: any }>(opts: TableSubscription<Row>): () => void {
  let hasConnectedBefore = false;
  // Channel names must be unique per subscription, otherwise supabase-js reuses an already-joined channel.
  const channel = supabase
    .channel(`rt-${opts.table}-${++channelCounter}`)
    .on<Row>('postgres_changes', { event: '*', schema: 'public', table: opts.table }, (payload) => {
      opts.onChange(payload);
    })
    .subscribe((status: string, err?: Error) => {
      if (status === 'SUBSCRIBED') {
        if (hasConnectedBefore) opts.onResync();
        hasConnectedBefore = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        opts.onError?.(err?.message ?? `Live updates for "${opts.table}" are temporarily unavailable.`);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

// Several components can call the same hook; they share ONE channel per key (reference counted).
const shared = new Map<string, { count: number; stop: () => void }>();

export function acquireShared(key: string, start: () => () => void): () => void {
  let entry = shared.get(key);
  if (!entry) {
    entry = { count: 0, stop: start() };
    shared.set(key, entry);
  }
  entry.count += 1;
  const owned = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owned.count -= 1;
    if (owned.count === 0) {
      owned.stop();
      shared.delete(key);
    }
  };
}
