import { OPERATORS, evaluate, format } from './logic.js';

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}
const shorten = (text, length = 11) => [...String(text)].length > length ? [...String(text)].slice(0, length - 1).join('') + '…' : String(text);

function svgNode(node, annotations = {}, selected) {
  const annotation = Object.hasOwn(annotations, node.id) ? annotations[node.id] : {};
  const label = annotation.label || node.label;
  const note = annotation.note || node.note || '';
  const isTrue = node.value === true;
  const fill = node.output ? (isTrue ? '#edf5ff' : '#f3f3f6') : isTrue ? '#f8fbff' : '#fff';
  const stroke = selected === node.id ? '#0071e3' : isTrue ? '#bad7f5' : '#dedee5';
  const text = node.output ? (isTrue ? '#0066cc' : '#6e6e73') : '#1d1d1f';
  const sub = node.value === undefined || node.value === null ? node.subtitle : `${node.subtitle} · ${isTrue ? '1' : '0'}`;
  const title = `${label}；${sub}${note ? `；备注：${note}` : ''}`;
  return `<g class="graph-node" data-node="${escapeXml(node.id)}" role="button" tabindex="0" aria-label="${escapeXml(title)}" transform="translate(${node.x},${node.y})"><title>${escapeXml(title)}</title><rect x="-56" y="-31" width="112" height="62" rx="17" fill="${fill}" stroke="${stroke}" stroke-width="${selected === node.id ? 2 : 1.2}"/><text text-anchor="middle" y="${node.output ? -8 : -3}" fill="${node.output ? '#6e6e73' : text}" font-size="${node.output ? 11 : 19}" font-weight="500">${escapeXml(shorten(label))}</text><text text-anchor="middle" y="${node.output ? 15 : 16}" fill="${node.output ? text : '#8a8a90'}" font-size="${node.output ? 21 : 10}" font-weight="${node.output ? 600 : 400}">${escapeXml(node.output ? (node.value === null ? '—' : isTrue ? '真 · 1' : '假 · 0') : sub)}</text>${note ? '<circle cx="44" cy="21" r="2.5" fill="#0071e3"/>' : ''}</g>`;
}

function svgLink(from, to, value, label = '', inactive = false, slot = 0) {
  const x1 = from.x + 58;
  const x2 = to.x - 59;
  const y1 = from.y;
  const y2 = to.y + slot;
  let path;
  if (x2 > x1) {
    const middle = (x1 + x2) / 2;
    path = `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
  } else {
    const detour = Math.min(y1, y2) - 60;
    path = `M ${x1} ${y1} C ${x1 + 60} ${detour}, ${x2 - 60} ${detour}, ${x2} ${y2}`;
  }
  const color = value === true && !inactive ? '#0071e3' : '#c9c9d0';
  const marker = value === true && !inactive ? 'arrow-true' : 'arrow-false';
  const lx = (x1 + x2) / 2;
  const ly = (y1 + y2) / 2 - 7;
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" marker-end="url(#${marker})" ${inactive ? 'opacity=".42" stroke-dasharray="3 4"' : ''}/>${label ? `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" fill="#8a8a90">${escapeXml(label)}</text>` : ''}`;
}

function wrapSvg(width, height, title, nodes, links, annotations, selected) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,sans-serif"><title>${escapeXml(title)}</title><defs><marker id="arrow-true" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z" fill="#0071e3"/></marker><marker id="arrow-false" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z" fill="#c9c9d0"/></marker></defs>${links.join('')}${nodes.map(node => svgNode(node, annotations, selected)).join('')}</svg>`;
}

export function structureDiagram(ast, assignment, annotations = {}, selected = null) {
  const values = {};
  const result = evaluate(ast, assignment, values);
  const nodes = [];
  const edges = [];
  let leaf = 0;
  function layout(node) {
    let level = 0;
    let y;
    if (node.child) {
      const child = layout(node.child);
      level = child.level + 1;
      y = child.y;
      edges.push({ from: child, to: node.id });
    } else if (node.left) {
      const left = layout(node.left);
      const right = layout(node.right);
      level = Math.max(left.level, right.level) + 1;
      y = (left.y + right.y) / 2;
      edges.push({ from: left, to: node.id }, { from: right, to: node.id });
    } else { y = 70 + leaf++ * 84; }
    const details = { id: node.id, level, x: 75 + level * 164, y, value: values[node.id], label: node.kind === 'variable' ? node.name : node.kind === 'constant' ? (node.value ? '1' : '0') : OPERATORS[node.op].symbol, subtitle: node.kind === 'variable' ? '命题' : node.kind === 'constant' ? '常量' : OPERATORS[node.op].title };
    nodes.push(details);
    return details;
  }
  const root = layout(ast);
  const height = Math.max(290, 140 + (leaf - 1) * 84);
  const shift = (height - (140 + (leaf - 1) * 84)) / 2;
  for (const node of nodes) node.y += shift;
  const output = { id: 'output', x: root.x + 164, y: root.y, label: '结果', output: true, value: result, subtitle: '输出' };
  nodes.push(output);
  const lookup = new Map(nodes.map(node => [node.id, node]));
  const links = edges.map(edge => svgLink(edge.from, lookup.get(edge.to), edge.from.value));
  links.push(svgLink(root, output, result));
  const width = output.x + 82;
  return { svg: wrapSvg(width, height, `逻辑结构图：${format(ast)}`, nodes, links, annotations, selected), width, height, nodes: lookup };
}

function modelValues(model, assignment) {
  const values = new Map();
  const selected = new Map();
  if (!assignment) return { values, selected };
  const nodes = new Map(model.nodeArray.map(node => [String(node.key), node]));
  const inbound = new Map();
  for (const link of model.linkArray) {
    const key = String(link.to);
    if (!inbound.has(key)) inbound.set(key, []);
    inbound.get(key).push(link);
  }
  const visiting = new Set();
  function value(key) {
    key = String(key);
    if (values.has(key)) return values.get(key);
    if (visiting.has(key)) return null;
    const node = nodes.get(key);
    if (!node) return null;
    visiting.add(key);
    let result = null;
    if (node.type === '0' || node.type === '1') result = node.type === '1';
    else if (node.type === 'Import') result = Object.hasOwn(assignment, node.name) ? Boolean(assignment[node.name]) : null;
    else if (node.type === 'SEL') {
      const links = inbound.get(key) || [];
      const input = links.find(link => link.topid === 'SI');
      const choice = node.variable && Object.hasOwn(assignment, node.variable) ? Boolean(assignment[node.variable]) : input ? value(input.from) : null;
      if (choice !== null) {
        selected.set(key, choice ? '1' : '0');
        const branch = links.find(link => link.topid === (choice ? '1' : '0'));
        result = branch ? value(branch.from) : null;
      }
    } else if (node.type === 'Export') {
      const link = (inbound.get(key) || [])[0];
      result = link ? value(link.from) : null;
    }
    visiting.delete(key);
    values.set(key, result);
    return result;
  }
  for (const node of model.nodeArray) value(node.key);
  return { values, selected };
}

export function decisionDiagram(model, assignment = null, annotations = {}, selectedNode = null) {
  if (!model.nodeArray.length) return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><text x="200" y="120" text-anchor="middle" fill="#6e6e73" font-family="sans-serif" font-size="16">图形中还没有节点。</text></svg>', width: 400, height: 240, nodes: new Map() };
  const clean = model.nodeArray.map(node => ({ ...node, key: String(node.key) }));
  const nodes = new Map(clean.map(node => [node.key, node]));
  const levels = new Map();
  const pending = new Set(clean.map(node => node.key));
  const inbound = new Map();
  for (const link of model.linkArray) {
    const key = String(link.to);
    if (!inbound.has(key)) inbound.set(key, []);
    inbound.get(key).push(String(link.from));
  }
  while (pending.size) {
    let progress = false;
    for (const key of [...pending]) {
      const sources = inbound.get(key) || [];
      if (!sources.length || sources.every(source => levels.has(source))) {
        levels.set(key, sources.length ? 1 + Math.max(...sources.map(source => levels.get(source))) : 0);
        pending.delete(key);
        progress = true;
      }
    }
    // Original saved circuit models may contain feedback. Keep them viewable.
    if (!progress) {
      const base = Math.max(0, ...levels.values()) + 1;
      [...pending].forEach((key, index) => levels.set(key, base + Math.floor(index / 5)));
      break;
    }
  }
  const groups = new Map();
  for (const node of clean) {
    const level = levels.get(node.key);
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(node);
  }
  const maxLevel = Math.max(...levels.values());
  const height = Math.max(330, 70 + Math.max(...[...groups.values()].map(group => group.length)) * 77);
  const width = 160 + maxLevel * 184;
  const computed = modelValues(model, assignment);
  const drawn = [];
  for (const [level, group] of groups) {
    group.forEach((node, index) => {
      drawn.push({ id: node.key, x: 80 + level * 184, y: 35 + (height - 70) * ((index + .5) / group.length), label: node.type === 'SEL' ? (node.variable ? `${node.variable} ?` : 'SEL') : node.name || node.type, subtitle: node.type === 'SEL' ? '真假选择' : node.type === 'Import' ? '输入命题' : node.type === 'Export' ? '输出' : '常量', output: node.type === 'Export', value: computed.values.has(node.key) ? computed.values.get(node.key) : null, note: node.memo || '' });
    });
  }
  const lookup = new Map(drawn.map(node => [node.id, node]));
  const links = model.linkArray.map(link => {
    const from = lookup.get(String(link.from));
    const to = lookup.get(String(link.to));
    const target = nodes.get(String(link.to));
    const choice = computed.selected.get(String(link.to));
    const branch = target.type === 'SEL' && ['0', '1'].includes(link.topid);
    const inactive = assignment && branch && choice !== undefined && choice !== link.topid;
    return svgLink(from, to, from.value, branch ? link.topid : link.topid === 'SI' ? '选择' : '', inactive, link.topid === '0' ? -16 : link.topid === '1' ? 16 : 0);
  });
  return { svg: wrapSvg(width, height, '布尔决策图', drawn, links, annotations, selectedNode), width, height, nodes: lookup };
}
