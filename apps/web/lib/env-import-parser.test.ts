import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, parseEnvValue } from './env-import-parser.ts';

test('quoted values end at the closing quote, comments after them are dropped', () => {
  assert.equal(parseEnvValue('"sk-abc" # prod key'), 'sk-abc');
  assert.equal(parseEnvValue("'a#b' # note"), 'a#b');
  assert.equal(parseEnvValue('"say \\"hi\\""'), 'say "hi"');
  assert.equal(parseEnvValue('plain # comment'), 'plain');
  assert.equal(parseEnvValue('a#b'), 'a#b');
});

test('CRLF files and export prefixes parse', () => {
  const vars = parseEnvFile('export OPENAI_API_KEY="sk-1" # main\r\nANTHROPIC_API_KEY=sk-2\r\n');
  assert.equal(vars.get('OPENAI_API_KEY'), 'sk-1');
  assert.equal(vars.get('ANTHROPIC_API_KEY'), 'sk-2');
});
