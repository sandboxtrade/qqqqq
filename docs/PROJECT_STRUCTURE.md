# Project structure

This archive intentionally contains normal folders. It contains no `.git` directory, no Git object files, no `node_modules`, no build output and no temporary download files.

Main layout:

```text
virtual-companion-v0.7.0/
├─ docs/
├─ public/
│  └─ assets/
│     ├─ character/
│     ├─ items/
│     ├─ locations/
│     ├─ private-scenes/
│     └─ rooms/
├─ src/
│  ├─ ai/
│  ├─ app/  # Zustand store + message-sync merge helpers
│  ├─ avatar/
│  ├─ character/
│  ├─ cognition/
│  ├─ config/
│  ├─ debug/
│  ├─ dialogue/
│  ├─ emotions/
│  ├─ engine/
│  ├─ events/
│  ├─ gifts/
│  ├─ initiative/
│  ├─ intimacy/
│  ├─ memory/
│  ├─ relationship/
│  ├─ shared-life/
│  ├─ storage/
│  │  ├─ persistence-schema.ts
│  │  ├─ live-sync.ts
│  │  └─ repositories/
│  ├─ ui/
│  │  ├─ components/
│  │  └─ screens/
│  ├─ watch/
│  └─ world/
├─ .env.example
├─ .gitignore
├─ firestore.rules
├─ index.html
├─ package.json
├─ README.md
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

When copying to a locally cloned GitHub repository, copy the contents of the extracted `virtual-companion-v0.7.0` folder into the repository root. The folder hierarchy must remain unchanged.


## Current avatar bridge (v0.7.0)

- `src/avatar/LivePhoto.tsx` — temporary single-photo WebGL renderer.
- `src/avatar/visual-state.ts` — read-only mapping from response `visualCue` + current emotion/world into render parameters.
- `src/ui/components/CharacterStage.tsx` — owns the transient cue lifetime and falls back to the current runtime state.

This is intentionally not the future layered pose/outfit/room system.
