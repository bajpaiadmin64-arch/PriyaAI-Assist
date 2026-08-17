'use strict';

/**
 * Safe calculator — a tiny recursive-descent parser.
 * Supports: + - * / % ^ ( ) decimals, whitespace. No eval().
 * Returns null when the expression is not a valid pure math expression.
 */

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const num = src.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(num)) return null;
      tokens.push({ t: 'num', v: parseFloat(num) });
      i = j;
      continue;
    }
    if ('+-*/%^()'.includes(c)) {
      tokens.push({ t: c });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

// All parse functions consume the REMAINING token list and return
// { ok: true, v, rest } — `rest` is the unconsumed tail.

function parseExpr(tokens) {
  let value = parseTerm(tokens);
  while (value.ok) {
    const op = value.rest[0];
    if (op && (op.t === '+' || op.t === '-')) {
      const right = parseTerm(value.rest.slice(1));
      if (!right.ok) return { ok: false };
      value = {
        ok: true,
        v: op.t === '+' ? value.v + right.v : value.v - right.v,
        rest: right.rest
      };
    } else {
      return value;
    }
  }
  return value;
}

function parseTerm(tokens) {
  let value = parsePower(tokens);
  while (value.ok) {
    const op = value.rest[0];
    if (op && (op.t === '*' || op.t === '/' || op.t === '%')) {
      const right = parsePower(value.rest.slice(1));
      if (!right.ok) return { ok: false };
      if ((op.t === '/' || op.t === '%') && right.v === 0) return { ok: false, divByZero: true };
      value = {
        ok: true,
        v: op.t === '*' ? value.v * right.v : op.t === '/' ? value.v / right.v : value.v % right.v,
        rest: right.rest
      };
    } else {
      return value;
    }
  }
  return value;
}

function parsePower(tokens) {
  const base = parseUnary(tokens);
  if (!base.ok) return base;
  const op = base.rest[0];
  if (op && op.t === '^') {
    const exp = parseUnary(base.rest.slice(1));
    if (!exp.ok) return { ok: false };
    return { ok: true, v: Math.pow(base.v, exp.v), rest: exp.rest };
  }
  return base;
}

function parseUnary(tokens) {
  const head = tokens[0];
  if (!head) return { ok: false };
  if (head.t === '-') {
    const inner = parseUnary(tokens.slice(1));
    if (!inner.ok) return { ok: false };
    return { ok: true, v: -inner.v, rest: inner.rest };
  }
  if (head.t === '(') {
    const inner = parseExpr(tokens.slice(1));
    if (!inner.ok || !inner.rest[0] || inner.rest[0].t !== ')') return { ok: false };
    return { ok: true, v: inner.v, rest: inner.rest.slice(1) };
  }
  if (head.t === 'num') return { ok: true, v: head.v, rest: tokens.slice(1) };
  return { ok: false };
}

/**
 * Evaluate a pure math expression.
 * @param {string} expr e.g. "1245 * 87" or "2^10 - 3*(4+1)"
 * @returns {{ok:true, value:number, expr:string}|{ok:false, reason?:string}}
 */
function calc(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return { ok: false };
  const clean = expr
    .trim()
    .replace(/[×]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−]/g, '-');
  const tokens = tokenize(clean);
  if (!tokens || tokens.length === 0) return { ok: false };
  const res = parseExpr(tokens, 0);
  if (!res.ok) return { ok: false };
  if (res.rest.length > 0) return { ok: false };
  if (!Number.isFinite(res.v)) return { ok: false };
  return { ok: true, value: res.v, expr: clean };
}

module.exports = { calc };