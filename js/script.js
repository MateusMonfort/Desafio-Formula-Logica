
function tokenize(s) {
  s = s.replace(/\$/g,' ').trim();
  const tokens = [];
  const patterns = [
    ["WS", /^\s+/],
    ["FORALL", /^(\\forall|∀)/],
    ["EXISTS", /^(\\exists|∃)/],
    ["NOT", /^(\\neg|¬|\\lnot|~|!)/],
    ["AND", /^(\\land|\\wedge|∧|&)/],
    ["OR", /^(\\lor|\\vee|∨|\|)/],
    ["IMPLIES", /^(\\rightarrow|\\to|→|->)/],
    ["IFF", /^(\\leftrightarrow|↔|<->|<=>)/],
    ["LPAREN", /^\(/],
    ["RPAREN", /^\)/],
    ["COMMA", /^,/],
    ["DOT", /^\./],
    ["IDENT", /^[A-Za-z_][A-Za-z0-9_]*/],
    ["UNKNOWN", /^./]
  ];
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [type, re] of patterns) {
      const m = s.slice(i).match(re);
      if (m) {
        matched = true;
        const tok = m[0];
        if (type !== "WS") tokens.push({type, value: tok});
        i += tok.length;
        break;
      }
    }
    if (!matched) i++;
  }
  return tokens;
}


function parse(s) {
  const tokens = tokenize(s);
  let pos = 0;
  
  function peek() { return tokens[pos] || null; }
  function consume(type) {
    const t = tokens[pos];
    if (t && t.type === type) { pos++; return t; }
    return null;
  }
  function expect(type) {
    const t = consume(type);
    if (!t) throw new Error(`Esperado ${type}, encontrado ${peek()?.type || 'fim'}`);
    return t;
  }

  function parseFormula() { return parseIff(); }
  function parseIff() {
    let left = parseImplies();
    while (peek() && peek().type === "IFF") {
      consume("IFF");
      const right = parseImplies();
      if (!right) throw new Error('Esperado fórmula após ↔');
      left = {type:'iff', a:left, b:right};
    }
    return left;
  }
  function parseImplies() {
    let left = parseOr();
    while (peek() && peek().type === "IMPLIES") {
      consume("IMPLIES");
      const right = parseImplies();
      if (!right) throw new Error('Esperado fórmula após →');
      left = {type:'implies', a:left, b:right};
    }
    return left;
  }
  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().type === "OR") {
      consume("OR");
      const right = parseAnd();
      if (!right) throw new Error('Esperado fórmula após ∨');
      left = {type:'or', a:left, b:right};
    }
    return left;
  }
  function parseAnd() {
    let left = parseUnary();
    while (peek() && peek().type === "AND") {
      consume("AND");
      const right = parseUnary();
      if (!right) throw new Error('Esperado fórmula após ∧');
      left = {type:'and', a:left, b:right};
    }
    return left;
  }
  function parseUnary() {
    const t = peek();
    if (!t) return null;
    
    if (t.type === "NOT") { 
      consume("NOT"); 
      const sub = parseUnary(); 
      if (!sub) throw new Error('Esperado fórmula após ¬');
      return {type:'not', a:sub}; 
    }
    
    if (t.type === "FORALL" || t.type === "EXISTS") {
      const qtype = (t.type === "FORALL") ? 'forall' : 'exists';
      consume(t.type);
      const vars = [];
      
      // collect variables (IDENT)
      while (peek() && peek().type === "IDENT") {
        vars.push(consume("IDENT").value);
      }
      if (vars.length === 0) {
        throw new Error(`Esperado variável após ${qtype === 'forall' ? '∀' : '∃'}`);
      }
      
      // optional dot
      if (peek() && peek().type === "DOT") consume("DOT");
      
      const sub = parseUnary();
      if (!sub) throw new Error(`Esperado fórmula após quantificador`);
      
      let node = sub;
      for (let i = vars.length-1; i >= 0; i--) {
        node = {type:qtype, var:vars[i], a: node};
      }
      return node;
    }
    
    if (t.type === "LPAREN") {
      consume("LPAREN");
      const f = parseFormula();
      if (!f) throw new Error('Esperado fórmula após (');
      expect("RPAREN");
      return f;
    }
    
    if (t.type === "IDENT") {
      const name = consume("IDENT").value;
      // predicate with optional args: if next is LPAREN, parse args
      if (peek() && peek().type === "LPAREN") {
        consume("LPAREN");
        const args = [];
        while (peek() && peek().type !== "RPAREN") {
          if (peek().type === "IDENT") {
            args.push({type:'var', name:consume("IDENT").value});
          } else if (peek().type === "COMMA") {
            consume("COMMA");
          } else {
            throw new Error(`Token inesperado em argumentos: ${peek().type}`);
          }
        }
        expect("RPAREN");
        return {type:'pred', name: name, args: args};
      }
      // plain predicate with zero args
      return {type:'pred', name: name, args: []};
    }
    
    throw new Error(`Token inesperado: ${t.type}`);
  }

  const ast = parseFormula();
  if (pos < tokens.length) {
    throw new Error(`Tokens extras encontrados: ${tokens.slice(pos).map(t => t.value).join(' ')}`);
  }
  return ast;
}


function cloneAst(x){ return JSON.parse(JSON.stringify(x)); }


function astToLatex(a) {
  if (!a) return '';
  switch(a.type) {
    case 'pred':
      if (!a.args || a.args.length === 0) return a.name;
      return a.name + '(' + a.args.map(t => termToLatex(t)).join(',') + ')';
    case 'not': return `\\lnot ${wrap(a.a)}`;
    case 'and': return `${wrap(a.a)} \\land ${wrap(a.b)}`;
    case 'or': return `${wrap(a.a)} \\lor ${wrap(a.b)}`;
    case 'implies': return `${wrap(a.a)} \\rightarrow ${wrap(a.b)}`;
    case 'iff': return `${wrap(a.a)} \\leftrightarrow ${wrap(a.b)}`;
    case 'forall': return `\\forall ${a.var} \\, ${astToLatex(a.a)}`;
    case 'exists': return `\\exists ${a.var} \\, ${astToLatex(a.a)}`;
    case 'func': 
      if (!a.args || a.args.length === 0) return a.name;
      return a.name + '(' + a.args.map(t => termToLatex(t)).join(',') + ')';
    case 'var': return a.name;
    default: return '\\text{?}';
  }
  
  function wrap(x) {
    if (!x) return '';
    if (['and','or','implies','iff'].includes(x.type)) {
      return `(${astToLatex(x)})`;
    }
    return astToLatex(x);
  }
}


function termToLatex(t) {
  if (!t) return '';
  switch(t.type) {
    case 'var': return t.name;
    case 'func': 
      if (!t.args || t.args.length === 0) return t.name;
      return t.name + '(' + t.args.map(a => termToLatex(a)).join(',') + ')';
    default: return t.name || '?';
  }
}


function eliminateImplications(node) {
  if (!node) return node;
  switch(node.type) {
    case 'implies': {
      return {type:'or', a: {type:'not', a: eliminateImplications(node.a)}, b: eliminateImplications(node.b)};
    }
    case 'iff': {
      const a1 = {type:'implies', a: node.a, b: node.b};
      const a2 = {type:'implies', a: node.b, b: node.a};
      return eliminateImplications({type:'and', a: a1, b: a2});
    }
    case 'and': return {type:'and', a: eliminateImplications(node.a), b: eliminateImplications(node.b)};
    case 'or': return {type:'or', a: eliminateImplications(node.a), b: eliminateImplications(node.b)};
    case 'not': return {type:'not', a: eliminateImplications(node.a)};
    case 'forall': return {type:'forall', var: node.var, a: eliminateImplications(node.a)};
    case 'exists': return {type:'exists', var: node.var, a: eliminateImplications(node.a)};
    default: return cloneAst(node);
  }
}


function toNNF(node) {
  if (!node) return node;
  function nnf(n, neg) {
    if (!n) return null;
    if (n.type === 'not') return nnf(n.a, !neg);
    if (n.type === 'and' || n.type === 'or') {
      const left = nnf(n.a, neg);
      const right = nnf(n.b, neg);
      if (neg) {
        if (n.type === 'and') return {type:'or', a:left, b:right};
        if (n.type === 'or') return {type:'and', a:left, b:right};
      } else {
        return {type:n.type, a:left, b:right};
      }
    }
    if (n.type === 'forall' || n.type === 'exists') {
      if (neg) {
        const sw = (n.type === 'forall') ? 'exists' : 'forall';
        return {type: sw, var: n.var, a: nnf(n.a, true)};
      } else {
        return {type: n.type, var:n.var, a: nnf(n.a, false)};
      }
    }
    if (neg) return {type:'not', a: cloneAst(n)};
    return cloneAst(n);
  }
  return nnf(node, false);
}


let skCounter = 0, renameCounter = 0;
function freshSk(prefix='sk') { skCounter++; return prefix + skCounter; }
function freshVar(prefix='v') { renameCounter++; return prefix + renameCounter; }


function substitute(node, varName, replacement) {
  if (!node) return node;
  switch(node.type) {
    case 'pred':
      return {type:'pred', name:node.name, args: node.args.map(t => {
        if (t.type === 'var') {
          return (t.name === varName) ? replacement : t;
        }
        return t;
      })};
    case 'forall':
    case 'exists':
      if (node.var === varName) return cloneAst(node);
      return {type:node.type, var: node.var, a: substitute(node.a, varName, replacement)};
    case 'and':
    case 'or': return {type:node.type, a: substitute(node.a, varName, replacement), b: substitute(node.b, varName, replacement)};
    case 'not': return {type:'not', a: substitute(node.a, varName, replacement)};
    default: return cloneAst(node);
  }
}


function renameBoundVars(node) {
  if (!node) return node;
  switch(node.type) {
    case 'forall':
    case 'exists': {
      const old = node.var;
      const nv = freshVar(old + '_');
      const subtree = substitute(node.a, old, {type:'var', name:nv});
      const renamedChild = renameBoundVars(subtree);
      return {type: node.type, var: nv, a: renamedChild};
    }
    case 'and':
    case 'or':
      return {type: node.type, a: renameBoundVars(node.a), b: renameBoundVars(node.b)};
    case 'not':
      return {type:'not', a: renameBoundVars(node.a)};
    default:
      return cloneAst(node);
  }
}


function pullQuantifiers(node) {
  if (!node) return {quantifiers:[], matrix:null};
  if (node.type === 'forall' || node.type === 'exists') {
    const inner = pullQuantifiers(node.a);
    return {quantifiers: [{type: node.type, var: node.var}, ...inner.quantifiers], matrix: inner.matrix};
  }
  if (node.type === 'and' || node.type === 'or') {
    const L = pullQuantifiers(node.a);
    const R = pullQuantifiers(node.b);
    const qs = [...L.quantifiers, ...R.quantifiers];
    const mat = {type: node.type, a: L.matrix, b: R.matrix};
    return {quantifiers: qs, matrix: mat};
  }
  if (node.type === 'not') {
    const P = pullQuantifiers(node.a);
    return {quantifiers: P.quantifiers, matrix: {type:'not', a: P.matrix}};
  }
  return {quantifiers: [], matrix: cloneAst(node)};
}

function buildPrenex(quantifiers, matrix) {
  let node = cloneAst(matrix);
  for (let i = quantifiers.length-1;i>=0;--i) node = {type: quantifiers[i].type, var: quantifiers[i].var, a: node};
  return node;
}


function skolemize(prenexNode) {
  const qlist = [];
  let cur = prenexNode;
  while (cur && (cur.type === 'forall' || cur.type === 'exists')) {
    qlist.push({type:cur.type, var: cur.var});
    cur = cur.a;
  }
  let matrix = cur;
  const universalPrefix = [];
  const subs = {};
  for (const q of qlist) {
    if (q.type === 'forall') universalPrefix.push(q.var);
    else {
      if (universalPrefix.length === 0) {
        const c = freshSk('c');
        subs[q.var] = {type:'func', name:c, args: []};
      } else {
        const fname = freshSk('f');
        subs[q.var] = {type:'func', name: fname, args: universalPrefix.map(v=>({type:'var', name:v}))};
      }
    }
  }
  function applySubs(node) {
    if (!node) return node;
    switch(node.type) {
      case 'pred':
        return {type:'pred', name:node.name, args: node.args.map(t => applyTerm(t))};
      case 'and':
      case 'or':
        return {type: node.type, a: applySubs(node.a), b: applySubs(node.b)};
      case 'not':
        return {type:'not', a: applySubs(node.a)};
      default:
        return cloneAst(node);
    }
  }
  function applyTerm(t) {
    if (!t) return t;
    if (t.type === 'var') {
      if (subs[t.name]) return subs[t.name];
      return t;
    }
    if (t.type === 'func') return {type:'func', name:t.name, args: t.args.map(a=>applyTerm(a))};
    return t;
  }
  const newMatrix = applySubs(matrix);
  return newMatrix;
}


function toCNF(node) {
  if (!node) return node;
  if (node.type === 'and') return {type:'and', a: toCNF(node.a), b: toCNF(node.b)};
  if (node.type === 'or') {
    const A = toCNF(node.a);
    const B = toCNF(node.b);
    if (A.type === 'and') {
      return toCNF({type:'and', a: {type:'or', a:A.a, b:B}, b: {type:'or', a:A.b, b:B}});
    }
    if (B.type === 'and') {
      return toCNF({type:'and', a: {type:'or', a:A, b:B.a}, b: {type:'or', a:A, b: B.b}});
    }
    return {type:'or', a:A, b:B};
  }
  if (node.type === 'not') return {type:'not', a: toCNF(node.a)};
  return cloneAst(node);
}


function toDNF(node) {
  if (!node) return node;
  if (node.type === 'or') return {type:'or', a: toDNF(node.a), b: toDNF(node.b)};
  if (node.type === 'and') {
    const A = toDNF(node.a);
    const B = toDNF(node.b);
    if (A.type === 'or') {
      return toDNF({type:'or', a:{type:'and', a:A.a, b:B}, b:{type:'and', a:A.b, b:B}});
    }
    if (B.type === 'or') {
      return toDNF({type:'or', a:{type:'and', a:A, b:B.a}, b:{type:'and', a:A, b:B.b}});
    }
    return {type:'and', a:A, b:B};
  }
  if (node.type === 'not') return {type:'not', a: toDNF(node.a)};
  return cloneAst(node);
}


function extractClausesFromCNF(node) {
  const clauses = [];
  function collectConj(n, out) {
    if (!n) return;
    if (n.type === 'and') { 
      collectConj(n.a, out); 
      collectConj(n.b, out); 
      return; 
    }
    out.push(n);
  }
  
  const conj = [];
  collectConj(node, conj);
  
  for (const c of conj) {
    const lits = [];
    function collectDisj(n, arr) {
      if (!n) return;
      if (n.type === 'or') { 
        collectDisj(n.a, arr); 
        collectDisj(n.b, arr); 
        return; 
      }
      if (n.type === 'not') {
        arr.push({pos: false, lit: n.a});
      } else {
        arr.push({pos: true, lit: n});
      }
    }
    collectDisj(c, lits);
    clauses.push(lits);
  }
  return clauses;
}


function isHornClause(clause) {
  let pos = 0;
  for (const l of clause) {
    if (l.pos) pos++;
  }
  return pos <= 1;
}


function classifyHornClause(clause) {
  const posCount = clause.filter(l => l.pos).length;
  const negCount = clause.filter(l => !l.pos).length;
  
  if (posCount === 0) return 'goal';
  if (posCount === 1 && negCount === 0) return 'fact';
  if (posCount === 1 && negCount > 0) return 'rule';
  return 'not-horn';
}


function clauseToLatex(clause) {
  if (!clause || clause.length === 0) return '\\text{cláusula vazia}';
  return clause.map(l => {
    const s = astToLatex(l.lit);
    return l.pos ? s : `\\lnot ${s}`;
  }).join(' \\lor ');
}


function clausesToLatex(clauses) {
  if (!clauses || clauses.length === 0) return '\\text{conjunto vazio}';
  return clauses.map(c => `(${clauseToLatex(c)})`).join(' \\land ');
}



const inputEl = document.getElementById('input');
const renderInput = document.getElementById('renderInput');
const stepsContainer = document.getElementById('stepsContainer');

function insertSym(s) {
  const el = inputEl;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value;
  el.value = text.slice(0,start) + s + text.slice(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + s.length;
}

function setExample(s) {
  inputEl.value = s;
  updateRenderInput();
}

function clearAll() {
  inputEl.value = '';
  renderInput.innerHTML = '';
  stepsContainer.innerHTML = '';
  MathJax.typesetPromise();
}

function updateRenderInput() {
  const raw = inputEl.value.trim();
  if (!raw) { renderInput.innerHTML = '—'; MathJax.typesetPromise(); return; }
  renderInput.innerHTML = '$$' + raw + '$$';
  MathJax.typesetPromise();
}


function addStep(title, latex) {
  const div = document.createElement('div');
  div.className = 'step';
  div.innerHTML = `<div class="title">${title}</div><div style="font-size:18px">\\(${latex}\\)</div>`;
  stepsContainer.appendChild(div);
}


function runAll() {
  stepsContainer.innerHTML = '';
  skCounter = 0; renameCounter = 0;
  const raw = inputEl.value.trim();
  if (!raw) { 
    alert('Digite uma fórmula LaTeX primeiro.'); 
    return; 
  }
  

  renderInput.innerHTML = '$$' + raw + '$$';
  MathJax.typesetPromise();


  let ast;
  try {
    ast = parse(raw);
    if (!ast) throw new Error('Parser retornou vazio — verifique sintaxe.');
  } catch (e) {
    addStep('Erro no parser', `\\text{${e.message || 'Entrada inválida'}}`);
    console.error(e);
    return;
  }

  try {

    addStep('Fórmula original', astToLatex(ast));


    const noImp = eliminateImplications(ast);
    addStep('Eliminar → e ↔ (implicações/equivalências)', astToLatex(noImp));


    const nnf = toNNF(noImp);
    addStep('NNF — Forma Normal Negativa (negações internas)', astToLatex(nnf));


    const renamed = renameBoundVars(nnf);
    addStep('Renomear variáveis ligadas (alpha-conversion)', astToLatex(renamed));


    const pulled = pullQuantifiers(renamed);
    const prenex = buildPrenex(pulled.quantifiers, pulled.matrix);
    addStep('Forma Prenex (quantificadores na frente)', astToLatex(prenex));


    const skolemized = skolemize(prenex);
    addStep('Skolemização (remover ∃ por funções/constantes)', astToLatex(skolemized));


    const cnf = toCNF(skolemized);
    addStep('CNF — Forma Normal Conjuntiva', astToLatex(cnf));


    const clauses = extractClausesFromCNF(cnf);
    const clauseLatex = clausesToLatex(clauses);
    addStep('Forma Cláusal (conjunto de cláusulas)', clauseLatex);


    if (clauses.length > 0) {
      let hornAnalysis = [];
      let allHorn = true;
      
      clauses.forEach((clause, i) => {
        const isHorn = isHornClause(clause);
        const type = classifyHornClause(clause);
        if (!isHorn) allHorn = false;
        
        let typeDesc = '';
        switch(type) {
          case 'fact': typeDesc = 'Fato'; break;
          case 'rule': typeDesc = 'Regra'; break;
          case 'goal': typeDesc = 'Goal'; break;
          default: typeDesc = 'Não-Horn';
        }
        
        hornAnalysis.push(`C_{${i+1}}: (${clauseToLatex(clause)}) \\rightarrow \\text{${typeDesc}}`);
      });
      
      const hornLatex = hornAnalysis.join('\\\\');
      addStep('Análise de cláusulas de Horn', hornLatex);
      

      const summary = allHorn ? 
        '\\text{Todas as cláusulas são de Horn}' :
        '\\text{Nem todas as cláusulas são de Horn}';
      addStep('Resumo Horn', summary);
      
    } else {
      addStep('Análise de cláusulas de Horn', '\\text{Nenhuma cláusula encontrada}');
    }


    const dnf = toDNF(skolemized);
    addStep('DNF — Forma Normal Disjuntiva (comparação)', astToLatex(dnf));

  } catch (e) {
    addStep('Erro durante transformação', `\\text{${e.message || 'Erro inesperado'}}`);
    console.error(e);
  }

  MathJax.typesetPromise();
}

document.addEventListener('DOMContentLoaded', function() {
  inputEl.addEventListener('input', () => {
    updateRenderInput();
  });

  updateRenderInput();
});
