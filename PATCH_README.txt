Yuzuki settings layout fix

Replace only these files in the current project:
- src/App.tsx
- src/ui/SettingsScreen.tsx
- src/styles.css

What changes:
- Settings become a real full-screen page: character photo, Yuzuki top bar and bottom navigation are hidden while settings are open.
- A dedicated settings header with Back and Refresh is used.
- The main settings screen is one clean scrollable page instead of a large card squeezed between app chrome.
- Personality and Memory are always two separate visible rows.
- Export buttons no longer get clipped by the next block and become 2 columns on narrow phones.
- Diagnostics gets a normal visible collapsed row.
- Personality/Memory/export editors remain full-screen and use safe-area padding on iPhone.
- No Firebase/Auth/App Check/Firestore/Worker/runtime logic is changed.
- No character photos are included or touched.

No Cloudflare Worker deploy is required for this patch.
