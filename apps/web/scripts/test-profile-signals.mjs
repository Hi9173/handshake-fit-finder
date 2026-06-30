import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/profileSignals.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
});
const { characteristicSource, orderedProfileSignals } = await import(
  `data:text/javascript,${encodeURIComponent(outputText)}`
);

const profile = {
  resumeCharacteristics: ["Python", "SQL", "React"],
  userCharacteristics: ["Open to startups", "React"],
  characteristics: ["Open to startups", "React", "Python", "SQL"],
};

assert.deepEqual(orderedProfileSignals(profile), ["Python", "SQL", "React", "Open to startups"]);
assert.equal(characteristicSource("React", profile), "resume");
assert.equal(characteristicSource("Open to startups", profile), "user");
