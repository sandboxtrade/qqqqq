import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("TurnInput declares optional narrative context used by economy events", () => {
  const file = ts.createSourceFile("runtime.ts", source("src/engine/runtime.ts"), ts.ScriptTarget.Latest, true);
  const input = file.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === "TurnInput");
  assert.ok(input, "missing TurnInput");
  const field = input.members.find(member => ts.isPropertySignature(member) && member.name?.getText(file) === "contextText");
  assert.ok(field, "contextText is referenced by the runtime and must exist on TurnInput");
  assert.ok(field.questionToken, "contextText must remain optional for ordinary chat messages");
  assert.equal(field.type.kind, ts.SyntaxKind.StringKeyword);
});

test("wallet passes strict TypeScript checking (no topup kind widening)", () => {
  const original = source("src/storage/player-data.ts");
  const importHeader = 'import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";\nimport { getFirebaseDb, isFirebaseConfigured } from "./firebase";';
  assert.ok(original.includes(importHeader), "update the typecheck stub for changed Firebase imports");
  const stubs = `declare const isFirebaseConfigured: boolean;
    declare function getFirebaseDb(): object | null;
    declare function doc(db: object, ...parts: string[]): { firestore: object };
    declare function getDoc(ref: object): Promise<{exists(): boolean; data(): any}>;
    declare function setDoc(ref: object, value: any): Promise<void>;
    declare function runTransaction<T>(db: object, callback: (tx: {get(ref:object):Promise<{exists():boolean;data():any}>;set(ref:object,data:any):void})=>Promise<T>):Promise<T>;`;
  const dir = mkdtempSync(join(tmpdir(), "game2-deploy-typecheck-"));
  try {
    const filename = join(dir, "player-data.ts");
    writeFileSync(filename, original.replace(importHeader, stubs));
    const program = ts.createProgram([filename], {
      strict: true, noEmit: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], skipLibCheck: true,
    });
    const errors = ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
