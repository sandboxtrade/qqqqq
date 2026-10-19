import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const transpile = ts.transpileModule(read("src/storage/social-feed.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const mod = { exports: {} };
new Function("require", "module", "exports", "localStorage", transpile)((name) => {
  if (name === "firebase/firestore") return { doc: () => {}, getDoc: () => {}, setDoc: () => {} };
  if (name === "./firebase") return { getFirebaseDb: () => null, isFirebaseConfigured: false };
  throw new Error(`Unexpected import ${name}`);
}, mod, mod.exports, localStorage);
const social = mod.exports;

test("social sandbox state is private and isolated per user", async () => {
  assert.deepEqual(social.emptySocialState().ownPosts, []);
  social.cacheSocialState("alice", {...social.emptySocialState(), likedPostIds:["alex-post-office"], updatedAt: 5});
  assert.deepEqual(social.readCachedSocialState("bob").likedPostIds, []);
  assert.deepEqual(social.readCachedSocialState("alice").likedPostIds,["alex-post-office"]);
  assert.equal((await social.fetchSocialState("alice")).likedPostIds.length,1);
});
test("real post composition and input sanitation", () => {
  const post = social.createSocialPost("  Привет, Game2!  ", "https://example.com/picture.webp");
  assert.equal(post.authorId, "player");
  assert.equal(post.text, "Привет, Game2!");
  assert.equal(post.imageUrl, "https://example.com/picture.webp");
  assert.throws(() => social.createSocialPost("", ""));
  assert.throws(() => social.createSocialPost("test", "http://example.com/a.jpg"));
  assert.equal(social.safeSocialImageUrl("javascript:alert(1)"), "");
  assert.equal(social.safeSocialImageUrl("https://u:pass@example.com/a.png"), "");
});
test("own posts and comments cannot impersonate Alexandra through saved documents", () => {
  const dirty = { ownPosts:[{id:"post_123",authorId:"alexandra_v1",text:"hello",imageUrl:"",createdAt:100}], comments:[{id:"comment_123",postId:"alex-post-office",authorId:"alexandra_v1",text:"hi",createdAt:123}] };
  const safe = social.sanitizeSocialState(dirty);
  assert.equal(safe.ownPosts[0].authorId,"player");
  assert.equal(safe.comments[0].authorId,"player");
  assert.equal(social.toggleSocialId(["alex-post-office"],"alex-post-office").length,0);
  assert.deepEqual(social.toggleSocialId([],"alex-post-office"),["alex-post-office"]);
});
test("social interface retains key actions and does not touch dialogue or shared Firestore rules", () => {
  const page = read("src/ui/AlexandraSocial.tsx");
  const app = read("src/App.tsx");
  const rules = read("firestore.rules");
  for (const pattern of [/createSocialPost/,/createSocialComment/,/toggleSocialId/,/Подписаться/,/Опубликовать/,/Сохранённое/,/uploadSocialState/]) assert.match(page,pattern);
  assert.match(app,/uid=\{uid\}/);
  assert.match(rules,/request\.auth\.uid == userId/);
  assert.match(read("src/storage/social-feed.ts"),/"users", uid, "social", "feed"/);
});
