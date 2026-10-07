import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/ui/ChatScreen.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(chat, /useLayoutEffect/);
assert.doesNotMatch(chat, /scrollIntoView\(/);
assert.match(chat, /node\.scrollTop = target/);
assert.match(chat, /node\.scrollTo\(\{ top: target, behavior \}\)/);
assert.match(chat, /messages\.at\(-1\)\?\.imageStatus/);
assert.match(chat, /onLoad=\{handlePhotoLoaded\}/);
assert.match(chat, /nearBottomRef\.current/);
assert.match(styles, /\.social-content \.chat-scroll[\s\S]*?overflow-anchor:\s*none/);

console.log("PASS chat bottom pinning avoids scrollIntoView jumps and media layout drift");
