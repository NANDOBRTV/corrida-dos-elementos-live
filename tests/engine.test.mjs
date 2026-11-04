import test from "node:test";
import assert from "node:assert/strict";
import {CASES} from "../src/selftest.js";
for(const [name,fn] of CASES) test(name,()=>assert.doesNotThrow(fn));
