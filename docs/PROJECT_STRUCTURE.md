# Project structure

This archive intentionally contains normal folders. It contains no `.git` directory, no Git object files, no `node_modules`, no build output and no temporary download files.

Main layout:

```text
virtual-companion-v0.5/
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
│  ├─ app/
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

When copying to a locally cloned GitHub repository, copy the contents of the extracted `virtual-companion-v0.5` folder into the repository root. The folder hierarchy must remain unchanged.
