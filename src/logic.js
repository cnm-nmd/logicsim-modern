export const MAX_VARIABLES = 10;
export const MAX_TOKENS = 256;

export class LogicError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = 'LogicError';
    this.position = position;
  }
}

export const OPERATORS = {
  not: { symbol: '¬', title: '逻辑非', rpn: '<' },
  and: { symbol: '∧', title: '逻辑与', rpn: '.' },
  or: { symbol: '∨', title: '逻辑或', rpn: ',' },
  implies: { symbol: '→', title: '逻辑推出', rpn: '>' },
  iff: { symbol: '↔', title: '逻辑等价', rpn: '=' },
};

const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const namedOperators = { AND: 'and', OR: 'or', NOT: 'not', IMPLIES: 'implies', IFF: 'iff' };
const symbolOperators = {
  '<->': 'iff', '<=>': 'iff', '↔': 'iff', '⇔': 'iff', '=': 'iff',
  '->': 'implies', '=>': 'implies', '→': 'implies', '⇒': 'implies', '>': 'implies',
  '&&': 'and', '&': 'and', '∧': 'and', '||': 'or', '|': 'or', '∨': 'or',
  '!': 'not', '~': 'not', '¬': 'not',
};

function inputText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new LogicError('先输入一个逻辑表达式。');
  if (text.length > 4096) throw new LogicError('表达式太长了，请控制在 4096 个字符以内。');
  return text.trim();
}

function operand(word, position) {
  if (['1', 'true', '⊤'].includes(word.toLowerCase())) return { kind: 'constant', value: true, position };
  if (['0', 'false', '⊥'].includes(word.toLowerCase())) return { kind: 'constant', value: false, position };
  if (!identifier.test(word)) throw new LogicError(`“${word}”不是有效的命题名称。可使用字母、中文、数字和下划线，且不要以数字开头。`, position);
  if (word.length > 32) throw new LogicError('命题名称请控制在 32 个字符以内。', position);
  return { kind: 'variable', name: word, position };
}

export function tokenize(text) {
  text = inputText(text);
  const tokens = [];
  let position = 0;
  let nesting = 0;
  const symbols = Object.keys(symbolOperators).sort((a, b) => b.length - a.length);
  while (position < text.length) {
    const rest = text.slice(position);
    const blank = /^\s+/.exec(rest);
    if (blank) { position += blank[0].length; continue; }
    if (rest[0] === '(' || rest[0] === ')') {
      nesting += rest[0] === '(' ? 1 : -1;
      if (nesting > 48) throw new LogicError('括号嵌套过深，请拆分表达式。', position);
      tokens.push({ kind: rest[0], position });
      position++;
    } else {
      const symbol = symbols.find(s => rest.startsWith(s));
      if (symbol) {
        tokens.push({ kind: symbolOperators[symbol], position });
        position += symbol.length;
      } else {
        const match = /^(?:[\p{L}_][\p{L}\p{N}_]*|[01⊤⊥])/u.exec(rest);
        if (!match) throw new LogicError(`第 ${position + 1} 个字符“${rest[0]}”无法识别。`, position);
        const word = match[0];
        tokens.push(namedOperators[word.toUpperCase()] ? { kind: namedOperators[word.toUpperCase()], position } : operand(word, position));
        position += word.length;
      }
    }
    if (tokens.length > MAX_TOKENS) throw new LogicError(`表达式过于复杂，最多支持 ${MAX_TOKENS} 个符号。`);
  }
  tokens.push({ kind: 'end', position: text.length });
  return tokens;
}

export function parseInfix(text) {
  const tokens = tokenize(text);
  let cursor = 0;
  let serial = 0;
  let depth = 0;
  const make = node => ({ ...node, id: `n${serial++}` });
  const current = () => tokens[cursor];
  const binary = (op, left, right) => make({ kind: 'binary', op, left, right });

  function atom() {
    if (++depth > 64) throw new LogicError('表达式嵌套过深，请拆分表达式。', current().position);
    let node;
    const token = current();
    if (token.kind === 'not') {
      cursor++;
      node = make({ kind: 'unary', op: 'not', child: atom() });
    } else if (token.kind === '(') {
      cursor++;
      node = equivalence();
      if (current().kind !== ')') throw new LogicError('缺少右括号 “)”。', current().position);
      cursor++;
    } else if (token.kind === 'variable' || token.kind === 'constant') {
      cursor++;
      node = make(token.kind === 'variable' ? { kind: 'variable', name: token.name } : { kind: 'constant', value: token.value });
    } else {
      throw new LogicError(token.kind === 'end' ? '表达式还没写完，这里需要一个命题。' : '这里需要一个命题、非运算或左括号。', token.position);
    }
    depth--;
    return node;
  }
  function conjunction() {
    let node = atom();
    while (current().kind === 'and') { cursor++; node = binary('and', node, atom()); }
    return node;
  }
  function disjunction() {
    let node = conjunction();
    while (current().kind === 'or') { cursor++; node = binary('or', node, conjunction()); }
    return node;
  }
  function implication() {
    let node = disjunction();
    if (current().kind === 'implies') { cursor++; node = binary('implies', node, implication()); }
    return node;
  }
  function equivalence() {
    let node = implication();
    while (current().kind === 'iff') { cursor++; node = binary('iff', node, implication()); }
    return node;
  }
  const ast = equivalence();
  if (current().kind !== 'end') throw new LogicError(current().kind === ')' ? '多了一个右括号 “)”。' : '两个命题之间需要一个逻辑运算符。', current().position);
  validateAst(ast);
  return ast;
}

export function parseRpn(text) {
  text = inputText(text);
  const tokens = Array.from(text.matchAll(/[.,<>=]|[^\s.,<>=]+/g));
  if (tokens.length > MAX_TOKENS) throw new LogicError(`表达式过于复杂，最多支持 ${MAX_TOKENS} 个符号。`);
  const stack = [];
  const aliases = { '.': 'and', ',': 'or', '<': 'not', '>': 'implies', '=': 'iff', '∧': 'and', '∨': 'or', '¬': 'not', '→': 'implies', '↔': 'iff' };
  let serial = 0;
  const make = node => ({ ...node, id: `n${serial++}` });
  for (const match of tokens) {
    const word = match[0];
    const op = aliases[word] || namedOperators[word.toUpperCase()];
    if (!op) {
      const token = operand(word, match.index);
      stack.push(make(token.kind === 'variable' ? { kind: 'variable', name: token.name } : { kind: 'constant', value: token.value }));
    } else if (op === 'not') {
      if (!stack.length) throw new LogicError('“非”运算前面需要一个命题。', match.index);
      stack.push(make({ kind: 'unary', op, child: stack.pop() }));
    } else {
      if (stack.length < 2) throw new LogicError(`“${OPERATORS[op].title}”前面需要两个命题。`, match.index);
      const right = stack.pop();
      const left = stack.pop();
      stack.push(make({ kind: 'binary', op, left, right }));
    }
  }
  if (stack.length !== 1) throw new LogicError('还有命题没有参与运算，请检查是否少了运算符。');
  validateAst(stack[0]);
  return stack[0];
}

export const parse = (text, syntax = 'infix') => syntax === 'rpn' ? parseRpn(text) : parseInfix(text);

export function walk(ast, visit) {
  visit(ast);
  if (ast.child) walk(ast.child, visit);
  if (ast.left) { walk(ast.left, visit); walk(ast.right, visit); }
}

function validateAst(ast) {
  function check(node, depth) {
    if (depth > 64) throw new LogicError('表达式嵌套过深，请拆分表达式。');
    if (node.child) check(node.child, depth + 1);
    if (node.left) { check(node.left, depth + 1); check(node.right, depth + 1); }
  }
  check(ast, 0);
  if (variables(ast).length > MAX_VARIABLES) throw new LogicError(`最多支持 ${MAX_VARIABLES} 个不同命题，避免真值组合过多。`);
}

export function variables(ast) {
  const names = new Set();
  walk(ast, node => { if (node.kind === 'variable') names.add(node.name); });
  return [...names];
}

export function evaluate(ast, assignment, values = {}) {
  let result;
  if (ast.kind === 'constant') result = ast.value;
  else if (ast.kind === 'variable') {
    if (!Object.hasOwn(assignment, ast.name)) throw new LogicError(`请给命题“${ast.name}”设置真假值。`);
    result = Boolean(assignment[ast.name]);
  } else if (ast.kind === 'unary') result = !evaluate(ast.child, assignment, values);
  else {
    const left = evaluate(ast.left, assignment, values);
    const right = evaluate(ast.right, assignment, values);
    if (ast.op === 'and') result = left && right;
    else if (ast.op === 'or') result = left || right;
    else if (ast.op === 'implies') result = !left || right;
    else if (ast.op === 'iff') result = left === right;
    else throw new LogicError('遇到了不支持的逻辑运算。');
  }
  values[ast.id] = result;
  return result;
}

export function format(ast) {
  if (ast.kind === 'variable') return ast.name;
  if (ast.kind === 'constant') return ast.value ? '1' : '0';
  if (ast.kind === 'unary') return `¬${format(ast.child)}`;
  return `(${format(ast.left)} ${OPERATORS[ast.op].symbol} ${format(ast.right)})`;
}

export function toRpn(ast) {
  if (ast.kind === 'variable') return ast.name;
  if (ast.kind === 'constant') return ast.value ? '1' : '0';
  if (ast.kind === 'unary') return `${toRpn(ast.child)} <`;
  return `${toRpn(ast.left)} ${toRpn(ast.right)} ${OPERATORS[ast.op].rpn}`;
}

export function truthTable(ast) {
  const names = variables(ast);
  const rows = [];
  const total = 2 ** names.length;
  let trueCount = 0;
  for (let index = 0; index < total; index++) {
    const assignment = Object.fromEntries(names.map((name, position) => [name, Boolean(index & (1 << (names.length - 1 - position)))]));
    const result = evaluate(ast, assignment);
    if (result) trueCount++;
    rows.push({ index, assignment, result });
  }
  return { names, rows, total, trueCount, falseCount: total - trueCount, kind: trueCount === total ? 'tautology' : trueCount === 0 ? 'contradiction' : 'contingent' };
}

// A reduced ordered Boolean decision diagram, stored in the original nodeArray/linkArray format.
export function decisionModel(ast, table = truthTable(ast)) {
  const decisions = [];
  const memo = new Map();
  const links = [];
  const usedVariables = new Set();
  function build(level, start, length) {
    const first = table.rows[start].result;
    if (table.rows.slice(start, start + length).every(row => row.result === first)) return first ? 'one' : 'zero';
    const half = length / 2;
    const low = build(level + 1, start, half);
    const high = build(level + 1, start + half, half);
    if (low === high) return low;
    const name = table.names[level];
    const signature = `${level}|${low}|${high}`;
    if (memo.has(signature)) return memo.get(signature);
    const key = `select:${decisions.length}`;
    memo.set(signature, key);
    decisions.push({ key, type: 'SEL', name, variable: name });
    usedVariables.add(name);
    links.push(
      { from: low, frompid: low.startsWith('select:') ? 'N' : 'OUT', to: key, topid: '0' },
      { from: high, frompid: high.startsWith('select:') ? 'N' : 'OUT', to: key, topid: '1' },
      { from: `input:${name}`, frompid: 'OUT', to: key, topid: 'SI' },
    );
    return key;
  }
  const output = build(0, 0, table.total);
  links.push({ from: output, frompid: output.startsWith('select:') ? 'N' : 'OUT', to: 'result', topid: 'OUT' });
  const inputNodes = table.names.filter(name => usedVariables.has(name)).map(name => ({ key: `input:${name}`, type: 'Import', name }));
  return { nodeArray: [{ key: 'zero', type: '0', name: '0' }, { key: 'one', type: '1', name: '1' }, ...inputNodes, ...decisions, { key: 'result', type: 'Export', name: '结果' }], linkArray: links };
}

export function validateModel(model) {
  if (!model || !Array.isArray(model.nodeArray) || !Array.isArray(model.linkArray)) throw new LogicError('文件需要包含 nodeArray 和 linkArray，或者是新版 LogicSim 项目文件。');
  if (model.nodeArray.length > 600 || model.linkArray.length > 1800) throw new LogicError('图形过大，最多支持 600 个节点、1800 条连线。');
  const keys = new Set();
  const nodes = model.nodeArray.map(node => {
    if (node.key === undefined || node.key === null || typeof node.key === 'object') throw new LogicError('有节点缺少有效的 key。');
    const key = String(node.key);
    if (keys.has(key)) throw new LogicError(`图中有重复的节点 key：“${key}”。`);
    if (!['0', '1', 'Import', 'Export', 'SEL'].includes(String(node.type))) throw new LogicError(`不支持节点类型“${String(node.type)}”。`);
    keys.add(key);
    return { key, type: String(node.type), name: String(node.name ?? node.type).slice(0, 200), variable: node.variable ? String(node.variable).slice(0, 32) : undefined, memo: String(node.memo ?? '').slice(0, 2000) };
  });
  const cleanLinks = model.linkArray.map(link => {
    const from = String(link.from);
    const to = String(link.to);
    if (!keys.has(from) || !keys.has(to)) throw new LogicError('有连线指向了不存在的节点。');
    return { from, to, frompid: String(link.frompid ?? 'OUT'), topid: String(link.topid ?? 'OUT') };
  });
  return { nodeArray: nodes, linkArray: cleanLinks };
}

export function csv(table) {
  const cell = value => `"${String(value).replaceAll('"', '""')}"`;
  return [table.names.map(cell).concat('"结果"').join(','), ...table.rows.map(row => table.names.map(name => row.assignment[name] ? '1' : '0').concat(row.result ? '1' : '0').join(','))].join('\r\n');
}
