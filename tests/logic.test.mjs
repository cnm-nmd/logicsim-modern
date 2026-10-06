import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseInfix, parseRpn, evaluate, variables, format, toRpn, truthTable, decisionModel, validateModel, csv, LogicError } from '../src/logic.js';
import { structureDiagram, decisionDiagram } from '../src/diagram.js';

test('all five operators produce the standard Boolean truth values', () => {
  const expected = { 'P ∧ Q': [false, false, false, true], 'P ∨ Q': [false, true, true, true], 'P → Q': [true, true, false, true], 'P ↔ Q': [true, false, false, true] };
  for (const [expression, values] of Object.entries(expected)) assert.deepEqual(truthTable(parseInfix(expression)).rows.map(row => row.result), values);
  assert.deepEqual(truthTable(parseInfix('¬P')).rows.map(row => row.result), [true, false]);
});

test('precedence, explicit parentheses, and right-associative implication', () => {
  assert.equal(evaluate(parseInfix('P ∨ Q ∧ R'), { P: true, Q: false, R: false }), true);
  assert.equal(evaluate(parseInfix('(P ∨ Q) ∧ R'), { P: true, Q: false, R: false }), false);
  assert.equal(evaluate(parseInfix('P → Q → R'), { P: false, Q: false, R: false }), true);
  assert.equal(evaluate(parseInfix('(P → Q) → R'), { P: false, Q: false, R: false }), false);
  assert.equal(evaluate(parseInfix('¬P ∧ Q'), { P: false, Q: false }), false);
});

test('keyboard aliases, English keywords, Chinese names, and constants', () => {
  const expressions = ['(P && Q) -> R', '(P AND Q) IMPLIES R', '(P & Q) => R', '(P ∧ Q) ⇒ R'];
  const baseline = truthTable(parseInfix(expressions[0])).rows.map(row => row.result);
  expressions.forEach(expression => assert.deepEqual(truthTable(parseInfix(expression)).rows.map(row => row.result), baseline));
  assert.equal(evaluate(parseInfix('下雨 → 带伞'), { 下雨: true, 带伞: false }), false);
  assert.equal(evaluate(parseInfix('NOT false <-> true'), {}), true);
  assert.equal(evaluate(parseInfix('¬⊥ ↔ ⊤'), {}), true);
  assert.deepEqual(variables(parseInfix('ANDY ∧ P_2')), ['ANDY', 'P_2']);
});

test('both syntax conversions preserve semantics, including repeated variables', () => {
  const expressions = ['P', '1', 'P ∧ ¬P', 'P ∨ ¬P', '(P ∧ Q) → R', '¬(P ∧ Q) ↔ (¬P ∨ ¬Q)', '(P → Q) ∧ (Q → R) → (P → R)', '(P ↔ Q) ↔ (P ∨ Q)'];
  for (const expression of expressions) {
    const ast = parseInfix(expression);
    const rpn = parseRpn(toRpn(ast));
    const formatted = parseInfix(format(ast));
    const rows = truthTable(ast).rows;
    for (const row of rows) {
      assert.equal(evaluate(rpn, row.assignment), row.result, expression);
      assert.equal(evaluate(formatted, row.assignment), row.result, expression);
    }
  }
  assert.equal(evaluate(parseRpn('a b . c >'), { a: true, b: true, c: false }), false);
});

test('invalid expressions fail with helpful errors instead of silently dropping operands', () => {
  for (const expression of ['', 'P Q', 'P ∧', '(P ∨ Q', 'P)', 'P @ Q', '2', '()']) assert.throws(() => parseInfix(expression), LogicError, expression);
  for (const expression of ['P Q', 'P .', '<', 'P Q . R', '( P )', '']) assert.throws(() => parseRpn(expression), LogicError, expression);
  assert.throws(() => evaluate(parseInfix('P'), {}), /设置真假值/);
});

test('complexity limits permit ten variables and reject excessive inputs', () => {
  const ten = Array.from({ length: 10 }, (_, index) => `P${index}`).join(' ∨ ');
  assert.equal(truthTable(parseInfix(ten)).total, 1024);
  assert.throws(() => parseInfix(ten + ' ∨ P10'), /最多支持 10/);
  assert.throws(() => parseInfix('('.repeat(49) + 'P' + ')'.repeat(49)), /嵌套过深/);
  assert.throws(() => parseInfix('P'.repeat(4097)), /4096/);
  assert.throws(() => parseRpn('P ' + '< '.repeat(65)), /嵌套过深/);
});

function evaluateModel(model, assignment) {
  const nodes = new Map(model.nodeArray.map(node => [String(node.key), node]));
  const inputs = key => model.linkArray.filter(link => String(link.to) === String(key));
  function evaluateNode(key) {
    const node = nodes.get(String(key));
    if (node.type === '0') return false;
    if (node.type === '1') return true;
    if (node.type === 'Import') return assignment[node.name];
    if (node.type === 'Export') return evaluateNode(inputs(key)[0].from);
    const links = inputs(key);
    const selector = evaluateNode(links.find(link => link.topid === 'SI').from);
    return evaluateNode(links.find(link => link.topid === (selector ? '1' : '0')).from);
  }
  return evaluateNode(model.nodeArray.find(node => node.type === 'Export').key);
}

test('decision graphs match every truth-table row and reduce constant outcomes', () => {
  const expressions = ['P', '0', '1', 'P ∧ Q', 'P ↔ Q', '(P ∧ Q) → R', '¬(P ∧ Q) ↔ (¬P ∨ ¬Q)', 'P ∧ ¬P', '(P → Q) ∧ (Q → R) → (P → R)', '((P ↔ Q) ∧ (R ∨ S)) → (P ∨ R)'];
  for (const expression of expressions) {
    const ast = parseInfix(expression);
    const table = truthTable(ast);
    const model = decisionModel(ast, table);
    validateModel(model);
    for (const row of table.rows) assert.equal(evaluateModel(model, row.assignment), row.result, `${expression}: ${JSON.stringify(row.assignment)}`);
  }
  assert.equal(decisionModel(parseInfix('P ∨ ¬P')).nodeArray.filter(node => node.type === 'SEL').length, 0);
});

test('new parser agrees with the downloaded original parser on valid legacy expressions', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../legacy/LogicParser.js', import.meta.url), 'utf8'), context);
  function originalValue(tree, assignment) {
    if (typeof tree === 'string') return tree === '1' ? true : tree === '0' ? false : assignment[tree];
    return originalValue(tree[originalValue(tree.S, assignment) ? 1 : 0], assignment);
  }
  const expressions = ['a b .', 'a b ,', 'a <', 'a b >', 'a b =', 'a b . fe >', 'a b . fe ge > =', 'a a < ,', 'a a < .', 'a b = a c , >', 'a b > b c > . a c > >'];
  for (const expression of expressions) {
    const ast = parseRpn(expression);
    const original = context.LogicParser(expression);
    for (const row of truthTable(ast).rows) assert.equal(originalValue(original, row.assignment), row.result, expression);
  }
});

test('original saved models with feedback stay importable, and malformed data is rejected', () => {
  const latch = JSON.parse(readFileSync(new URL('../legacy/latch.json', import.meta.url), 'utf8'));
  const model = validateModel(latch);
  const diagram = decisionDiagram(model);
  assert.equal(diagram.nodes.size, 7);
  assert.ok(diagram.svg.includes('布尔决策图'));
  assert.throws(() => validateModel({ nodeArray: [{ key: 0, type: '0' }, { key: '0', type: '1' }], linkArray: [] }), /重复/);
  assert.throws(() => validateModel({ nodeArray: [{ key: 0, type: '0' }], linkArray: [{ from: 0, to: 99 }] }), /不存在/);
  assert.throws(() => validateModel({ nodeArray: [], linkArray: null }), /nodeArray/);
});

test('SVG annotations and imported names are escaped, not interpreted as markup', () => {
  const ast = parseInfix('P');
  const attack = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const diagram = structureDiagram(ast, { P: true }, { [ast.id]: { label: attack, note: attack } });
  assert.ok(!diagram.svg.includes('<script>'));
  assert.ok(!diagram.svg.includes('<img'));
  assert.ok(diagram.svg.includes('&lt;script&gt;'));
  const model = validateModel({ nodeArray: [{ key: '__proto__', type: 'Import', name: attack }], linkArray: [] });
  assert.ok(!decisionDiagram(model).svg.includes('<script>'));
  const prototypeAst = parseInfix('__proto__ ∧ P');
  assert.equal(evaluate(prototypeAst, Object.fromEntries([['__proto__', true], ['P', true]])), true);
});

test('classification and CSV include all rows, even beyond the visible table page', () => {
  assert.equal(truthTable(parseInfix('P ∨ ¬P')).kind, 'tautology');
  assert.equal(truthTable(parseInfix('P ∧ ¬P')).kind, 'contradiction');
  const table = truthTable(parseInfix(Array.from({ length: 10 }, (_, index) => `P${index}`).join(' ∧ ')));
  assert.equal(table.kind, 'contingent');
  assert.equal(table.trueCount, 1);
  assert.equal(csv(table).split('\r\n').length, 1025);
});
