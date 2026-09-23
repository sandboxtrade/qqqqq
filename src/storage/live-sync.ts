import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import type { CharacterEvent } from "../events/event-types";
import type { ConversationCursor } from "./repositories/interfaces";
import { getFirebaseDb, isFirebaseConfigured } from "./firebase";
import { getAuthenticatedUid } from "./auth";
import {
  decodeCharacterEvent,
  decodeCompanionSnapshot,
} from "./persistence-schema";

export interface LiveSyncCallbacks {
  onEvents: (events: CharacterEvent[]) => void;
  onRevision: (revision: number) => void;
  onError?: (error: Error) => void;
}

export interface LiveSyncOptions {
  /** Newest conversation event that was already present before subscribing. */
  after?: ConversationCursor | null;
  catchUpBatchSize?: number;
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function conversationEvents(events: CharacterEvent[]) {
  return events.filter(
    (event) =>
      (event.type === "message" || event.type === "character_action") &&
      event.source !== "system",
  );
}

function cursorOf(event: CharacterEvent): ConversationCursor {
  return { timestamp: event.timestamp, id: event.id };
}

export function subscribeCharacterLiveSync(
  characterId: string,
  uid: string | null,
  callbacks: LiveSyncCallbacks,
  options: LiveSyncOptions = {},
): Unsubscribe {
  if (!isFirebaseConfigured || !uid) return () => {};
  const db = getFirebaseDb();
  if (!db) return () => {};

  const ensureOwner = () => {
    if (getAuthenticatedUid() !== uid)
      throw new Error("Сеанс изменился. Live sync остановлен.");
  };

  const fail = (error: unknown) => callbacks.onError?.(asError(error));
  const eventsRef = collection(
    db,
    "users",
    uid,
    "characters",
    characterId,
    "events",
  );
  let unsubscribeEvents: Unsubscribe = () => {};
  let unsubscribeState: Unsubscribe = () => {};
  let stopped = false;
  let catchUpRunning = false;
  let catchUpRequested = false;
  let contiguousCursor = options.after ?? null;
  const catchUpBatchSize = Math.max(
    50,
    Math.min(options.catchUpBatchSize ?? 200, 300),
  );

  const requestCatchUp = () => {
    if (stopped) return;
    if (catchUpRunning) {
      catchUpRequested = true;
      return;
    }
    catchUpRunning = true;
    void (async () => {
      try {
        do {
          catchUpRequested = false;
          while (!stopped) {
            ensureOwner();
            const constraints: QueryConstraint[] = [
              where("type", "in", ["message", "character_action"]),
              orderBy("timestamp", "asc"),
              orderBy(documentId(), "asc"),
            ];
            if (contiguousCursor)
              constraints.push(
                startAfter(contiguousCursor.timestamp, contiguousCursor.id),
              );
            constraints.push(limit(catchUpBatchSize));
            const snapshot = await getDocs(query(eventsRef, ...constraints));
            if (stopped) return;
            ensureOwner();
            if (!snapshot.docs.length) break;

            const decoded = snapshot.docs.map((item) =>
              decodeCharacterEvent(item.data(), item.id),
            );
            const last = decoded.at(-1);
            if (last) contiguousCursor = cursorOf(last);
            const events = conversationEvents(decoded);
            if (events.length) callbacks.onEvents(events);

            if (snapshot.docs.length < catchUpBatchSize) break;
          }
        } while (catchUpRequested && !stopped);
      } catch (error) {
        if (!stopped) fail(error);
      } finally {
        catchUpRunning = false;
        if (catchUpRequested && !stopped) requestCatchUp();
      }
    })();
  };

  try {
    ensureOwner();
    // Filter conversation events before limit so world simulation records can
    // never crowd messages out of the listener window. The cursor catch-up
    // below closes gaps larger than this realtime window after reconnects.
    const eventsQuery = query(
      eventsRef,
      where("type", "in", ["message", "character_action"]),
      orderBy("timestamp", "desc"),
      orderBy(documentId(), "desc"),
      limit(300),
    );
    unsubscribeEvents = onSnapshot(
      eventsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        try {
          ensureOwner();
          const events = conversationEvents(
            snapshot.docs
              .map((item) => decodeCharacterEvent(item.data(), item.id))
              .reverse(),
          );
          callbacks.onEvents(events);
          // Do not advance contiguousCursor from the bounded snapshot: if more
          // than 300 messages arrived offline that would skip the middle. Only
          // the ascending catch-up is allowed to advance it.
          requestCatchUp();
        } catch (error) {
          fail(error);
        }
      },
      fail,
    );

    unsubscribeState = onSnapshot(
      doc(db, "users", uid, "characters", characterId, "state", "current"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        try {
          ensureOwner();
          if (!snapshot.exists()) return;
          const state = decodeCompanionSnapshot(snapshot.data());
          callbacks.onRevision(state.revision ?? 0);
        } catch (error) {
          fail(error);
        }
      },
      fail,
    );
    requestCatchUp();
  } catch (error) {
    fail(error);
  }

  return () => {
    stopped = true;
    catchUpRequested = false;
    unsubscribeEvents();
    unsubscribeState();
  };
}
