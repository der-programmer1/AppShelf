import test from 'node:test';
import assert from 'node:assert/strict';
import {PASSWORD_ITERATIONS} from '../worker/accounts';
test('password derivation stays within the observed production limit of 100000 iterations',()=>{
 assert.ok(PASSWORD_ITERATIONS>0&&PASSWORD_ITERATIONS<=100000,'The hosted runtime rejects larger PBKDF2 iteration counts even when Miniflare accepts them.');
});
