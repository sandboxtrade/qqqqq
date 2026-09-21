# Firestore schema v4

Persistent companion data is scoped to the authenticated Firebase user. This prevents one Google-authenticated account from reading another account's companion data.

Base path:

`users/{uid}/characters/{characterId}`

Collections/documents:

- `users/{uid}/characters/{characterId}/state/current`
- `users/{uid}/characters/{characterId}/world/current`
- `users/{uid}/characters/{characterId}/events/{eventId}`
- `users/{uid}/characters/{characterId}/memories/{memoryId}`
- `users/{uid}/characters/{characterId}/knowledge/{factId}`
- `users/{uid}/characters/{characterId}/openThreads/{threadId}`
- `users/{uid}/characters/{characterId}/initiatives/{initiativeId}`
- `users/{uid}/characters/{characterId}/memoryProcessed/{eventId}`

`events` are source evidence. Derived state points back to events instead of replacing the source history. `memoryProcessed` is an idempotency ledger used during crash recovery.

## Security rule

The included `firestore.rules` permits access only when the path UID matches the signed-in Firebase Authentication UID:

```text
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

This is safer than a generic `request.auth != null` rule and is appropriate even if the GitHub Pages URL becomes public.

## World state

`world/current` stores only compact current simulation state:

- current location/activity
- time of day
- availability and awake state
- connection drive
- last simulation timestamp
- last user-interaction timestamp
- small rolling buffer of recent own-life events

It does not contain an ever-growing history. Significant world events are also written to `events` and may be consolidated into memory.

## Compatibility

Schema v4 changes the Firestore root path from the old unscoped `characters/{characterId}` layout to `users/{uid}/characters/{characterId}`. The project has not yet been put into real use, so no automatic data migration is included. If test data exists in the old path, leave it there or delete it before first real use.

Future collections: relationship milestones, activities, shared history, inventory, watch sessions and bounded debug traces.
