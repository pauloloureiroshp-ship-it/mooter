#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, 'dispatch-queue.schema.json');

function fieldPath(parent, field) {
  return parent === '$' ? field : `${parent}.${field}`;
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validDateTime(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateValue(value, rule, field, errors) {
  const actualType = valueType(value);
  if (rule.type && actualType !== rule.type) {
    errors.push({ field, message: `must be ${rule.type}, received ${actualType}` });
    return;
  }

  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
    errors.push({ field, message: `must be one of ${rule.enum.join('|')}` });
  }

  if (actualType === 'string') {
    if (rule.minLength != null && value.length < rule.minLength) {
      errors.push({ field, message: `must contain at least ${rule.minLength} character(s)` });
    }
    if (rule.maxLength != null && value.length > rule.maxLength) {
      errors.push({ field, message: `must contain at most ${rule.maxLength} character(s)` });
    }
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
      errors.push({ field, message: `must match ${rule.pattern}` });
    }
    if (rule.format === 'date-time' && !validDateTime(value)) {
      errors.push({ field, message: 'must be an RFC 3339 date-time' });
    }
  }

  if (actualType === 'object') {
    const properties = rule.properties || {};
    for (const required of rule.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        errors.push({ field: fieldPath(field, required), message: 'is required' });
      }
    }
    for (const [name, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, name)) {
        validateValue(child, properties[name], fieldPath(field, name), errors);
      } else if (rule.additionalProperties === false) {
        errors.push({ field: fieldPath(field, name), message: 'field is not allowed' });
      }
    }
  }

  if (Array.isArray(rule.oneOf)) {
    let matches = 0;
    for (const branch of rule.oneOf) {
      const branchErrors = [];
      validateValue(value, branch, field, branchErrors);
      if (branchErrors.length === 0) matches += 1;
    }
    if (matches !== 1) {
      const alternatives = rule.oneOf
        .flatMap((branch) => branch.required || [])
        .filter((name, index, all) => all.indexOf(name) === index);
      errors.push({
        field: alternatives.join('|') || field,
        message: 'exactly one alternative is required',
      });
    }
  }
}

function loadSchema(readFile = fs.readFileSync) {
  return JSON.parse(readFile(SCHEMA_PATH, 'utf8'));
}

function validateDocument(document, schema = loadSchema()) {
  const errors = [];
  validateValue(document, schema, '$', errors);
  return { ok: errors.length === 0, errors };
}

function run(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const readFile = io.readFile || fs.readFileSync;
  if (argv.length !== 1) {
    stderr.write('usage: node tools/agent-sync/dispatch-queue-validate.js <file>\n');
    return 1;
  }

  const input = path.resolve(argv[0]);
  let document;
  try {
    document = JSON.parse(readFile(input, 'utf8'));
  } catch (error) {
    stderr.write(`$: invalid JSON or unreadable file (${error.message})\n`);
    return 1;
  }

  const verdict = validateDocument(document, loadSchema(readFile));
  if (!verdict.ok) {
    for (const error of verdict.errors) stderr.write(`${error.field}: ${error.message}\n`);
    return 1;
  }
  stdout.write(`VALID ${path.relative(process.cwd(), input) || path.basename(input)}\n`);
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { SCHEMA_PATH, validDateTime, loadSchema, validateDocument, run };
