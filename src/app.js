import { parse, variables, evaluate, format, toRpn, truthTable, decisionModel, validateModel, csv, LogicError } from './logic.js';
import { structureDiagram, decisionDiagram } from './diagram.js';

const $ = selector => document.querySelector(selector);
const expression = $('#expression');
const examples = {
  conditional: '(P ∧ Q) → R',
  demorgan: '¬(P ∧ Q) ↔ (¬P ∨ ¬Q)',
  contradiction: 'P ∧ ¬P',
};
const state = { syntax: 'infix', expression: '', ast: null, table: null, model: null, assignment: {}, view: 'structure', graphView: 'structure', raw: false, dirty: false, annotations: { structure: {}, decision: {} }, activeNode: null, diagram: null, zoom: 1, center: null, page: 0 };
const pageSize = 16;
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}

function errorMessage(error) { return error instanceof Error ? error.message : '无法完成操作，请检查输入。'; }
function showError(error) {
  const field = $('#expression-error');
  field.textContent = errorMessage(error);
  field.hidden = false;
  expression.setAttribute('aria-invalid', 'true');
  if (error.position !== null && error.position !== undefined) expression.setSelectionRange(error.position, Math.min(expression.value.length, error.position + 1));
}
function clearError() { $('#expression-error').hidden = true; expression.removeAttribute('aria-invalid'); }

function analyze(options = {}) {
  try {
    const ast = parse(expression.value, state.syntax);
    const table = truthTable(ast);
    const model = decisionModel(ast, table);
    const previous = options.assignment || state.assignment;
    state.assignment = Object.fromEntries(table.names.map(name => [name, Object.hasOwn(previous, name) ? Boolean(previous[name]) : false]));
    state.ast = ast;
    state.table = table;
    state.model = model;
    state.expression = expression.value.trim();
    state.raw = false;
    state.dirty = false;
    state.page = 0;
    state.activeNode = null;
    state.zoom = 1;
    state.center = null;
    if (!options.keepAnnotations) state.annotations = { structure: {}, decision: {} };
    clearError();
    render();
    if (options.remember !== false) addHistory();
    return true;
  } catch (error) { showError(error); return false; }
}

function ensureAnalyzed() { return !state.dirty || analyze(); }

function setSyntax(syntax) {
  if (syntax === state.syntax) return;
  try {
    const ast = parse(expression.value, state.syntax);
    expression.value = syntax === 'rpn' ? toRpn(ast) : format(ast);
  } catch { /* Keep unfinished text so users can select its intended syntax. */ }
  state.syntax = syntax;
  state.dirty = true;
  updateSyntax();
  clearError();
  analyze({ keepAnnotations: true });
}

function updateSyntax() {
  document.querySelectorAll('[data-syntax]').forEach(button => {
    const active = button.dataset.syntax === state.syntax;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#syntax-hint').textContent = state.syntax === 'rpn' ? '旧版写法：P Q . R >，先写命题再写运算符' : '也可以输入 (P & Q) -> R';
  document.querySelectorAll('.symbol-toolbar [data-insert]').forEach(button => { button.disabled = state.syntax === 'rpn' && ['(', ')'].includes(button.dataset.insert); });
}

function setView(view) {
  if (!ensureAnalyzed()) return;
  if (state.raw && ['structure', 'table'].includes(view)) { toast('当前载入的是图形模型。生成一个表达式后即可查看结构图和真值表。'); return; }
  state.view = view;
  if (['structure', 'decision'].includes(view)) state.graphView = view;
  state.activeNode = null;
  state.zoom = 1;
  state.center = null;
  render();
}

function renderAssignments() {
  const container = $('#assignments');
  container.replaceChildren();
  if (!state.ast || !state.table.names.length) {
    const hint = document.createElement('p');
    hint.className = 'assignment-empty';
    hint.textContent = state.raw ? '图形模型模式' : '这是一个常量表达式。';
    container.append(hint);
    return;
  }
  for (const name of state.table.names) {
    const button = document.createElement('button');
    const value = state.assignment[name];
    button.className = `assignment-toggle${value ? ' is-true' : ''}`;
    button.dataset.variable = name;
    button.setAttribute('aria-pressed', String(value));
    button.setAttribute('aria-label', `${name} 当前为${value ? '真' : '假'}，点按切换`);
    const label = document.createElement('span');
    label.className = 'variable-name'; label.textContent = name;
    const badge = document.createElement('span');
    badge.className = 'toggle-value'; badge.textContent = value ? '真 1' : '假 0';
    button.append(label, badge);
    container.append(button);
  }
}

function renderSummary() {
  const badge = $('#classification');
  badge.classList.toggle('is-contradiction', state.raw || state.table?.kind === 'contradiction');
  if (state.raw) {
    $('#result-text').textContent = '—'; $('#result-value').textContent = '—';
    $('.current-result').classList.add('is-false');
    badge.textContent = '图形模型';
    $('#analysis-summary').textContent = `${state.model.nodeArray.length} 个节点 · ${state.model.linkArray.length} 条连线`;
  } else {
    const result = evaluate(state.ast, state.assignment);
    $('#result-text').textContent = result ? '真' : '假'; $('#result-value').textContent = result ? '1' : '0';
    $('.current-result').classList.toggle('is-false', !result);
    badge.textContent = { tautology: '恒真式', contradiction: '矛盾式', contingent: '可满足式' }[state.table.kind];
    $('#analysis-summary').textContent = `${state.dirty ? '上次结果 · ' : ''}${state.table.total} 种组合 · ${state.table.trueCount} 种为真`;
  }
}

function getDiagram(view = state.graphView, selected = state.activeNode) {
  return view === 'structure' && state.ast ? structureDiagram(state.ast, state.assignment, state.annotations.structure, selected) : decisionDiagram(state.model, state.raw ? null : state.assignment, state.annotations.decision, selected);
}

function applyViewBox() {
  const svg = $('#diagram svg');
  if (!svg || !state.diagram) return;
  const width = state.diagram.width / state.zoom;
  const height = state.diagram.height / state.zoom;
  const center = state.center || { x: state.diagram.width / 2, y: state.diagram.height / 2 };
  svg.setAttribute('viewBox', `${center.x - width / 2} ${center.y - height / 2} ${width} ${height}`);
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
}

function drawDiagram() {
  state.diagram = getDiagram(state.view);
  $('#diagram').innerHTML = state.diagram.svg;
  applyViewBox();
}

function renderTable() {
  if (!state.table) return;
  const table = $('#truth-table');
  const header = document.createElement('tr');
  for (const label of [...state.table.names, '结果']) {
    const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.append(th);
  }
  table.tHead.replaceChildren(header);
  const body = table.tBodies[0];
  body.replaceChildren();
  const start = state.page * pageSize;
  for (const row of state.table.rows.slice(start, start + pageSize)) {
    const tr = document.createElement('tr');
    tr.dataset.row = row.index;
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `${state.table.names.map(name => `${name} 为${row.assignment[name] ? '真' : '假'}`).join('，')}，结果为${row.result ? '真' : '假'}。点按应用该组合。`);
    tr.classList.toggle('is-selected', state.table.names.every(name => state.assignment[name] === row.assignment[name]));
    for (const value of [...state.table.names.map(name => row.assignment[name]), row.result]) {
      const td = document.createElement('td'); td.className = value ? 'truth-cell' : 'false-cell'; td.textContent = value ? '1' : '0'; tr.append(td);
    }
    body.append(tr);
  }
  const pages = Math.ceil(state.table.total / pageSize);
  $('#table-count').textContent = `${state.table.total} 种组合，点按一行应用取值`;
  $('#table-page').textContent = `第 ${state.page + 1} / ${pages} 页`;
  $('#prev-page').disabled = state.page === 0;
  $('#next-page').disabled = state.page + 1 >= pages;
}

function modelForExport() {
  return { nodeArray: state.model.nodeArray.map(node => {
    const annotation = Object.hasOwn(state.annotations.decision, String(node.key)) ? state.annotations.decision[String(node.key)] : null;
    return annotation ? { ...node, name: annotation.label || node.name, memo: annotation.note || node.memo || '' } : node;
  }), linkArray: state.model.linkArray };
}

function render() {
  updateSyntax();
  renderAssignments();
  renderSummary();
  const titles = { structure: ['逻辑结构图', '从命题到结果，看清每一步。'], decision: ['布尔决策图', state.raw ? '原版兼容图形，可点按节点编辑。' : '根据命题真假，选择 0 或 1 分支。'], table: ['真值表', '把每一种可能，摆在一起看。'], model: ['图形数据', '图形与文本，随时互换。'] };
  $('#preview-title').textContent = titles[state.view][0];
  $('#preview-description').textContent = state.dirty ? '表达式已修改，生成后更新结果。' : titles[state.view][1];
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = state.raw && ['structure', 'table'].includes(button.dataset.view);
  });
  $('#diagram-container').hidden = !['structure', 'decision'].includes(state.view);
  $('#table-container').hidden = state.view !== 'table';
  $('#model-container').hidden = state.view !== 'model';
  if (['structure', 'decision'].includes(state.view)) drawDiagram();
  if (state.view === 'table') renderTable();
  if (state.view === 'model') $('#model-json').value = JSON.stringify(modelForExport(), null, 2);
  $('#node-inspector').hidden = !state.activeNode || !['structure', 'decision'].includes(state.view);
}

function updateAssignment(name) {
  if (!state.ast || !Object.hasOwn(state.assignment, name)) return;
  state.assignment[name] = !state.assignment[name];
  render();
  [...document.querySelectorAll('[data-variable]')].find(button => button.dataset.variable === name)?.focus({ preventScroll: true });
}

function insertSymbol(symbol, scroll = false) {
  const rpn = { '∧': '.', '∨': ',', '¬': '<', '→': '>', '↔': '=' };
  if (state.syntax === 'rpn' && ['(', ')'].includes(symbol)) { toast('逆波兰表达式不需要括号。'); return; }
  const value = state.syntax === 'rpn' ? rpn[symbol] || symbol : symbol;
  const start = expression.selectionStart;
  const end = expression.selectionEnd;
  const text = state.syntax === 'rpn' ? ` ${value} ` : ['(', ')', '¬'].includes(symbol) ? value : ` ${value} `;
  expression.setRangeText(text, start, end, 'end');
  state.dirty = true;
  clearError();
  $('#preview-description').textContent = '表达式已修改，生成后更新结果。';
  renderSummary();
  expression.focus({ preventScroll: true });
  if (scroll) $('#workspace').scrollIntoView({ behavior: 'smooth' });
}

function loadExample(value) {
  state.syntax = 'infix';
  expression.value = value;
  state.view = 'structure'; state.graphView = 'structure';
  analyze({ assignment: {} });
  $('#workspace').scrollIntoView({ behavior: 'smooth' });
}

function inspectNode(id) {
  const node = state.diagram?.nodes.get(id);
  if (!node) return;
  state.activeNode = id;
  const annotations = state.annotations[state.view];
  const annotation = Object.hasOwn(annotations, id) ? annotations[id] : {};
  $('#node-label').value = annotation.label || node.label;
  $('#node-note').value = annotation.note || node.note || '';
  drawDiagram();
  $('#node-inspector').hidden = false;
  $('#node-label').focus({ preventScroll: true });
}

function saveNode() {
  if (!state.activeNode) return;
  const annotations = state.annotations[state.view];
  Object.defineProperty(annotations, state.activeNode, { value: { label: $('#node-label').value.trim().slice(0, 40), note: $('#node-note').value.trim().slice(0, 500) }, enumerable: true, configurable: true, writable: true });
  state.activeNode = null;
  render();
  toast('节点修改已保存到当前项目。');
}

function sanitizeAnnotations(input) {
  const clean = { structure: {}, decision: {} };
  for (const view of ['structure', 'decision']) {
    const items = input && Object.hasOwn(input, view) ? input[view] : null;
    if (!items || typeof items !== 'object' || Array.isArray(items)) continue;
    const entries = Object.entries(items).slice(0, 600);
    for (const [id, annotation] of entries) {
      if (!annotation || typeof annotation !== 'object') continue;
      Object.defineProperty(clean[view], id, { value: { label: String(annotation.label ?? '').slice(0, 40), note: String(annotation.note ?? '').slice(0, 500) }, enumerable: true, configurable: true, writable: true });
    }
  }
  return clean;
}

function loadModel(input, annotations = null) {
  const model = validateModel(input);
  state.model = model;
  state.ast = null; state.table = null; state.assignment = {};
  state.raw = true; state.dirty = false; state.expression = '';
  expression.value = '';
  state.annotations = sanitizeAnnotations(annotations);
  state.view = 'decision'; state.graphView = 'decision'; state.activeNode = null;
  state.zoom = 1; state.center = null;
  clearError();
  render();
}

async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new LogicError('项目文件请控制在 2 MB 以内。');
    const data = JSON.parse(await file.text());
    if (data?.schema === 'logicsim.project.v1' && typeof data.expression === 'string' && data.expression.trim()) {
      const syntax = data.syntax === 'rpn' ? 'rpn' : 'infix';
      // Validate before changing the current editor or project.
      parse(data.expression, syntax);
      state.syntax = syntax;
      expression.value = data.expression;
      if (!analyze({ assignment: data.assignment && typeof data.assignment === 'object' ? data.assignment : {}, remember: true })) return;
      state.annotations = sanitizeAnnotations(data.annotations);
      state.view = ['structure', 'decision', 'table', 'model'].includes(data.view) ? data.view : 'structure';
      if (['structure', 'decision'].includes(state.view)) state.graphView = state.view;
      render();
    } else loadModel(data, data.annotations);
    toast('项目已载入。');
    $('#workspace').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { toast(`载入失败：${error instanceof SyntaxError ? '文件不是有效的 JSON。' : errorMessage(error)}`); }
}

function project() {
  return { schema: 'logicsim.project.v1', expression: state.raw ? null : state.expression, syntax: state.raw ? 'model' : state.syntax, assignment: state.assignment, annotations: state.annotations, view: state.view, ...modelForExport() };
}

function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function saveProject() {
  if (!ensureAnalyzed()) return;
  download(JSON.stringify(project(), null, 2), 'LogicSim_项目.json', 'application/json;charset=utf-8');
}

function exportSvg() {
  if (!ensureAnalyzed()) return;
  const graph = getDiagram(state.graphView, null);
  download(graph.svg, 'LogicSim_逻辑图.svg', 'image/svg+xml;charset=utf-8');
}

async function exportPng() {
  if (!ensureAnalyzed()) return;
  const graph = getDiagram(state.graphView, null);
  const url = URL.createObjectURL(new Blob([graph.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(2, 4096 / Math.max(graph.width, graph.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(graph.width * scale); canvas.height = Math.ceil(graph.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败。');
    download(blob, 'LogicSim_逻辑图.png');
  } catch (error) { toast(errorMessage(error)); } finally { URL.revokeObjectURL(url); }
}

function exportCsv() {
  if (!ensureAnalyzed()) return;
  if (!state.table) { toast('先生成一个表达式，再导出真值表。'); return; }
  download('\ufeff' + csv(state.table), 'LogicSim_真值表.csv', 'text/csv;charset=utf-8');
}

async function share() {
  if (!ensureAnalyzed()) return;
  if (state.raw) { toast('图形模型请保存为项目文件后分享。'); return; }
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ e: state.expression, s: state.syntax, v: state.table.names.map(name => state.assignment[name] ? '1' : '0').join('') }).toString();
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url.href); toast('表达式链接已复制，包含当前命题取值。'); }
  catch { toast('分享链接已更新到地址栏，可从地址栏复制。'); }
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem('logicsim.history.v1') || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.expression === 'string' && item.expression.length <= 4096).slice(0, 6) : [];
  } catch { return []; }
}
function addHistory() {
  const records = readHistory().filter(item => item.expression !== state.expression || item.syntax !== state.syntax);
  records.unshift({ expression: state.expression, syntax: state.syntax });
  try { localStorage.setItem('logicsim.history.v1', JSON.stringify(records.slice(0, 6))); } catch { /* The tool also works without local storage. */ }
  renderHistory();
}
function renderHistory() {
  const records = readHistory();
  $('#history-section').hidden = !records.length;
  const list = $('#history-list'); list.replaceChildren();
  records.forEach(record => {
    const button = document.createElement('button'); button.className = 'history-item'; button.textContent = record.expression; button.title = record.expression;
    button.addEventListener('click', () => { state.syntax = record.syntax === 'rpn' ? 'rpn' : 'infix'; expression.value = record.expression; state.view = 'structure'; state.graphView = 'structure'; analyze({ assignment: {} }); $('#workspace').scrollIntoView({ behavior: 'smooth' }); });
    list.append(button);
  });
}

function zoom(amount) {
  if (!['structure', 'decision'].includes(state.view)) return;
  state.zoom = Math.min(3, Math.max(.4, state.zoom * amount));
  applyViewBox();
}

const actions = {
  help: () => $('#help-dialog').showModal(),
  'close-help': () => $('#help-dialog').close(),
  'focus-input': () => { $('#workspace').scrollIntoView({ behavior: 'smooth' }); expression.focus({ preventScroll: true }); },
  'show-table': () => { setView('table'); $('#workspace').scrollIntoView({ behavior: 'smooth' }); },
  'show-decision': () => { setView('decision'); $('#workspace').scrollIntoView({ behavior: 'smooth' }); },
  reset: () => loadExample(examples.conditional),
  import: () => $('#file-input').click(),
  save: saveProject,
  svg: exportSvg,
  png: exportPng,
  csv: exportCsv,
  share,
  'zoom-in': () => zoom(1.2),
  'zoom-out': () => zoom(1 / 1.2),
  fit: () => { state.zoom = 1; state.center = null; applyViewBox(); },
  'close-inspector': () => { state.activeNode = null; render(); },
  'save-node': saveNode,
  'apply-model': () => { try { loadModel(JSON.parse($('#model-json').value)); toast('文本已转换为图形。'); } catch (error) { toast(`无法转换：${error instanceof SyntaxError ? 'JSON 格式有误。' : errorMessage(error)}`); } },
  'clear-history': () => { try { localStorage.removeItem('logicsim.history.v1'); } catch {} renderHistory(); },
};

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.action) { const result = actions[button.dataset.action]?.(); if (result?.catch) result.catch(error => toast(errorMessage(error))); }
  else if (button.dataset.syntax) setSyntax(button.dataset.syntax);
  else if (button.dataset.view) setView(button.dataset.view);
  else if (button.dataset.variable) updateAssignment(button.dataset.variable);
  else if (button.dataset.insert) insertSymbol(button.dataset.insert, button.classList.contains('operator-item'));
  else if (button.dataset.example) loadExample(examples[button.dataset.example]);
});
$('#generate').addEventListener('click', () => analyze());
expression.addEventListener('input', () => { state.dirty = expression.value.trim() !== state.expression || state.raw; clearError(); $('#preview-description').textContent = state.dirty ? '表达式已修改，生成后更新结果。' : '从命题到结果，看清每一步。'; renderSummary(); });
expression.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); analyze(); } });
$('#file-input').addEventListener('change', async event => { await importFile(event.target.files[0]); event.target.value = ''; });
$('#prev-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderTable(); } });
$('#next-page').addEventListener('click', () => { if (state.table && (state.page + 1) * pageSize < state.table.total) { state.page++; renderTable(); } });

function selectTableRow(rowElement) {
  const row = state.table?.rows[Number(rowElement.dataset.row)];
  if (!row) return;
  state.assignment = { ...row.assignment };
  render();
  [...$('#truth-table').querySelectorAll('[data-row]')].find(element => element.dataset.row === rowElement.dataset.row)?.focus({ preventScroll: true });
}
$('#truth-table').addEventListener('click', event => { const row = event.target.closest('[data-row]'); if (row) selectTableRow(row); });
$('#truth-table').addEventListener('keydown', event => { const row = event.target.closest('[data-row]'); if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectTableRow(row); } });
$('#diagram').addEventListener('click', event => { const node = event.target.closest('[data-node]'); if (node) inspectNode(node.dataset.node); });
$('#diagram').addEventListener('keydown', event => { const node = event.target.closest('[data-node]'); if (node && ['Enter', ' '].includes(event.key)) { event.preventDefault(); inspectNode(node.dataset.node); } });

let pan = null;
$('#diagram').addEventListener('pointerdown', event => {
  if (event.target.closest('[data-node]') || event.button !== 0 || !state.diagram) return;
  const box = $('#diagram svg').getBoundingClientRect();
  const scale = Math.min(box.width / state.diagram.width, box.height / state.diagram.height) * state.zoom;
  const center = state.center || { x: state.diagram.width / 2, y: state.diagram.height / 2 };
  pan = { x: event.clientX, y: event.clientY, center: { ...center }, scale, pointer: event.pointerId };
  if (event.pointerType === 'mouse') event.preventDefault();
  $('#diagram').setPointerCapture(event.pointerId);
  $('#diagram').classList.add('is-panning');
});
$('#diagram').addEventListener('pointermove', event => { if (pan && pan.pointer === event.pointerId) { state.center = { x: pan.center.x - (event.clientX - pan.x) / pan.scale, y: pan.center.y - (event.clientY - pan.y) / pan.scale }; applyViewBox(); } });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#diagram').addEventListener(name, () => { pan = null; $('#diagram').classList.remove('is-panning'); });
$('#help-dialog').addEventListener('click', event => { if (event.target === $('#help-dialog')) { const box = event.target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('#help-dialog').close(); } });

function loadSharedExpression() {
  const params = new URLSearchParams(location.hash.slice(1));
  const shared = params.get('e');
  if (!shared) return analyze({ remember: false, assignment: {} });
  state.syntax = params.get('s') === 'rpn' ? 'rpn' : 'infix';
  expression.value = shared;
  try {
    const names = variables(parse(shared, state.syntax));
    const bits = params.get('v') || '';
    const assignment = Object.fromEntries(names.map((name, index) => [name, bits[index] === '1']));
    analyze({ assignment });
  } catch (error) { showError(error); expression.value = examples.conditional; state.syntax = 'infix'; analyze({ remember: false, assignment: {} }); toast('分享的表达式无法解析，已载入初始示例。'); }
}
window.addEventListener('hashchange', () => { if (new URLSearchParams(location.hash.slice(1)).has('e')) loadSharedExpression(); });
loadSharedExpression();
renderHistory();
