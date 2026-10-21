import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('redesign keeps four routes and has accessible current navigation', () => {
  const app = source('src/App.tsx');
  assert.match(app, /type Page = "chat" \| "people" \| "social" \| "profile" \| "settings"/);
  assert.match(app, /aria-current=\{page === "chat"/);
  assert.match(app, /aria-current=\{page === "people"/);
  assert.match(app, /aria-current=\{page === "social"/);
  assert.match(app, /aria-current=\{page === "profile"/);
  assert.match(app, /<ChatScreen\b/);
  assert.match(app, /<AlexandraSocial\b/);
  assert.match(app, /<PeopleScreen\b/);
  assert.match(app, /<MyProfile\b/);
});

test('settings returns to previously open page', () => {
  const app = source('src/App.tsx');
  assert.match(app, /setSettingsReturnPage\(page\)/);
  assert.match(app, /onClose=\{\(\) => setPage\(settingsReturnPage\)\}/);
  assert.match(app, /setSettingsReturnPage\("people"\)/);
});

test('new unified stylesheet is loaded last, supports narrow screens and motion preferences', () => {
  const app = source('src/App.tsx');
  const css = source('src/ui-refresh.css');
  assert.ok(app.indexOf('"./ui-refresh.css"') > app.indexOf('"./social-network.css"'));
  for (const selector of ['.alex-bottom-nav', '.alex-header', '.alex-profile-form', '.alex-person-card', '.chat-scroll', '.g2-social-post', '.settings-screen']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(css, /max-width: 390px/);
});

test('changed TSX modules parse without syntax errors', () => {
  for (const path of ['src/App.tsx', 'src/ui/components.tsx', 'src/ui/PeopleScreen.tsx', 'src/ui/MyProfile.tsx']) {
    const parsed = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics, [], path);
  }
});
