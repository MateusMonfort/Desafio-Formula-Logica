function tokenizar(s) {
  s = s.replace(/\$/g,' ').trim();
  const tokens = [];
  const padroes = [
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
    for (const [tipo, re] of padroes) {
      const m = s.slice(i).match(re);
      if (m) {
        matched = true;
        const tok = m[0];
        if (tipo !== "WS") tokens.push({tipo, valor: tok});
        i += tok.length;
        break;
      }
    }
    if (!matched) i++;
  }
  return tokens;
}

function analisar(s) {
  const tokens = tokenizar(s);
  let pos = 0;
  
  function espiar() { return tokens[pos] || null; }
  function consumir(tipo) {
    const t = tokens[pos];
    if (t && t.tipo === tipo) { pos++; return t; }
    return null;
  }
  function esperar(tipo) {
    const t = consumir(tipo);
    if (!t) throw new Error(`Esperado ${tipo}, encontrado ${espiar()?.tipo || 'fim'}`);
    return t;
  }

  function analisarFormula() { return analisarIff(); }
  function analisarIff() {
    let esquerda = analisarImplies();
    while (espiar() && espiar().tipo === "IFF") {
      consumir("IFF");
      const direita = analisarImplies();
      if (!direita) throw new Error('Esperado fórmula após ↔');
      esquerda = {tipo:'iff', a:esquerda, b:direita};
    }
    return esquerda;
  }
  function analisarImplies() {
    let esquerda = analisarOr();
    while (espiar() && espiar().tipo === "IMPLIES") {
      consumir("IMPLIES");
      const direita = analisarImplies();
      if (!direita) throw new Error('Esperado fórmula após →');
      esquerda = {tipo:'implies', a:esquerda, b:direita};
    }
    return esquerda;
  }
  function analisarOr() {
    let esquerda = analisarAnd();
    while (espiar() && espiar().tipo === "OR") {
      consumir("OR");
      const direita = analisarAnd();
      if (!direita) throw new Error('Esperado fórmula após ∨');
      esquerda = {tipo:'or', a:esquerda, b:direita};
    }
    return esquerda;
  }
  function analisarAnd() {
    let esquerda = analisarUnary();
    while (espiar() && espiar().tipo === "AND") {
      consumir("AND");
      const direita = analisarUnary();
      if (!direita) throw new Error('Esperado fórmula após ∧');
      esquerda = {tipo:'and', a:esquerda, b:direita};
    }
    return esquerda;
  }
  function analisarUnary() {
    const t = espiar();
    if (!t) return null;
    
    if (t.tipo === "NOT") { 
      consumir("NOT"); 
      const sub = analisarUnary(); 
      if (!sub) throw new Error('Esperado fórmula após ¬');
      return {tipo:'not', a:sub}; 
    }
    
    if (t.tipo === "FORALL" || t.tipo === "EXISTS") {
      const qtipo = (t.tipo === "FORALL") ? 'forall' : 'exists';
      consumir(t.tipo);
      const vars = [];
      
      while (espiar() && espiar().tipo === "IDENT") {
        vars.push(consumir("IDENT").valor);
      }
      if (vars.length === 0) {
        throw new Error(`Esperado variável após ${qtipo === 'forall' ? '∀' : '∃'}`);
      }
      
      if (espiar() && espiar().tipo === "DOT") consumir("DOT");
      
      const sub = analisarUnary();
      if (!sub) throw new Error(`Esperado fórmula após quantificador`);
      
      let node = sub;
      for (let i = vars.length-1; i >= 0; i--) {
        node = {tipo:qtipo, var:vars[i], a: node};
      }
      return node;
    }
    
    if (t.tipo === "LPAREN") {
      consumir("LPAREN");
      const f = analisarFormula();
      if (!f) throw new Error('Esperado fórmula após (');
      esperar("RPAREN");
      return f;
    }
    
    if (t.tipo === "IDENT") {
      const nome = consumir("IDENT").valor;
      if (espiar() && espiar().tipo === "LPAREN") {
        consumir("LPAREN");
        const args = [];
        while (espiar() && espiar().tipo !== "RPAREN") {
          if (espiar().tipo === "IDENT") {
            args.push({tipo:'var', nome:consumir("IDENT").valor});
          } else if (espiar().tipo === "COMMA") {
            consumir("COMMA");
          } else {
            throw new Error(`Token inesperado em argumentos: ${espiar().tipo}`);
          }
        }
        esperar("RPAREN");
        return {tipo:'pred', nome: nome, args: args};
      }
      return {tipo:'pred', nome: nome, args: []};
    }
    
    throw new Error(`Token inesperado: ${t.tipo}`);
  }

  const ast = analisarFormula();
  if (pos < tokens.length) {
    throw new Error(`Tokens extras encontrados: ${tokens.slice(pos).map(t => t.valor).join(' ')}`);
  }
  return ast;
}

function clonarAst(x){ return JSON.parse(JSON.stringify(x)); }

function astParaLatex(a) {
  if (!a) return '';
  switch(a.tipo) {
    case 'pred':
      if (!a.args || a.args.length === 0) return a.nome;
      return a.nome + '(' + a.args.map(t => termoParaLatex(t)).join(',') + ')';
    case 'not': return `\\lnot ${envolver(a.a)}`;
    case 'and': return `${envolver(a.a)} \\land ${envolver(a.b)}`;
    case 'or': return `${envolver(a.a)} \\lor ${envolver(a.b)}`;
    case 'implies': return `${envolver(a.a)} \\rightarrow ${envolver(a.b)}`;
    case 'iff': return `${envolver(a.a)} \\leftrightarrow ${envolver(a.b)}`;
    case 'forall': return `\\forall ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'exists': return `\\exists ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'func': 
      if (!a.args || a.args.length === 0) return a.nome;
      return a.nome + '(' + a.args.map(t => termoParaLatex(t)).join(',') + ')';
    case 'var': return a.nome;
    default: return '\\text{?}';
  }
  
  function envolver(x) {
    if (!x) return '';
    if (['and','or','implies','iff'].includes(x.tipo)) {
      return `(${astParaLatex(x)})`;
    }
    return astParaLatex(x);
  }
}

function termoParaLatex(t) {
  if (!t) return '';
  switch(t.tipo) {
    case 'var': return t.nome;
    case 'func': 
      if (!t.args || t.args.length === 0) return t.nome;
      return t.nome + '(' + t.args.map(a => termoParaLatex(a)).join(',') + ')';
    default: return t.nome || '?';
  }
}

function eliminarImplicacoes(node) {
  if (!node) return node;
  switch(node.tipo) {
    case 'implies': {
      return {tipo:'or', a: {tipo:'not', a: eliminarImplicacoes(node.a)}, b: eliminarImplicacoes(node.b)};
    }
    case 'iff': {
      const a1 = {tipo:'implies', a: node.a, b: node.b};
      const a2 = {tipo:'implies', a: node.b, b: node.a};
      return eliminarImplicacoes({tipo:'and', a: a1, b: a2});
    }
    case 'and': return {tipo:'and', a: eliminarImplicacoes(node.a), b: eliminarImplicacoes(node.b)};
    case 'or': return {tipo:'or', a: eliminarImplicacoes(node.a), b: eliminarImplicacoes(node.b)};
    case 'not': return {tipo:'not', a: eliminarImplicacoes(node.a)};
    case 'forall': return {tipo:'forall', var: node.var, a: eliminarImplicacoes(node.a)};
    case 'exists': return {tipo:'exists', var: node.var, a: eliminarImplicacoes(node.a)};
    default: return clonarAst(node);
  }
}

function paraNNF(node) {
  if (!node) return node;
  function nnf(n, neg) {
    if (!n) return null;
    if (n.tipo === 'not') return nnf(n.a, !neg);
    if (n.tipo === 'and' || n.tipo === 'or') {
      const esquerda = nnf(n.a, neg);
      const direita = nnf(n.b, neg);
      if (neg) {
        if (n.tipo === 'and') return {tipo:'or', a:esquerda, b:direita};
        if (n.tipo === 'or') return {tipo:'and', a:esquerda, b:direita};
      } else {
        return {tipo:n.tipo, a:esquerda, b:direita};
      }
    }
    if (n.tipo === 'forall' || n.tipo === 'exists') {
      if (neg) {
        const sw = (n.tipo === 'forall') ? 'exists' : 'forall';
        return {tipo: sw, var: n.var, a: nnf(n.a, true)};
      } else {
        return {tipo: n.tipo, var:n.var, a: nnf(n.a, false)};
      }
    }
    if (neg) return {tipo:'not', a: clonarAst(n)};
    return clonarAst(n);
  }
  return nnf(node, false);
}

let skContador = 0, renomearContador = 0;
function novoSk(prefixo='sk') { skContador++; return prefixo + skContador; }
function novaVar(prefixo='v') { renomearContador++; return prefixo + renomearContador; }

function substituir(node, nomeVar, substituto) {
  if (!node) return node;
  switch(node.tipo) {
    case 'pred':
      return {tipo:'pred', nome:node.nome, args: node.args.map(t => {
        if (t.tipo === 'var') {
          return (t.nome === nomeVar) ? substituto : t;
        }
        return t;
      })};
    case 'forall':
    case 'exists':
      if (node.var === nomeVar) return clonarAst(node);
      return {tipo:node.tipo, var: node.var, a: substituir(node.a, nomeVar, substituto)};
    case 'and':
    case 'or': return {tipo:node.tipo, a: substituir(node.a, nomeVar, substituto), b: substituir(node.b, nomeVar, substituto)};
    case 'not': return {tipo:'not', a: substituir(node.a, nomeVar, substituto)};
    default: return clonarAst(node);
  }
}

function renomearVariaveisLigadas(node) {
  if (!node) return node;
  switch(node.tipo) {
    case 'forall':
    case 'exists': {
      const antigo = node.var;
      const nv = novaVar(antigo + '_');
      const subarvore = substituir(node.a, antigo, {tipo:'var', nome:nv});
      const filhoRenomeado = renomearVariaveisLigadas(subarvore);
      return {tipo: node.tipo, var: nv, a: filhoRenomeado};
    }
    case 'and':
    case 'or':
      return {tipo: node.tipo, a: renomearVariaveisLigadas(node.a), b: renomearVariaveisLigadas(node.b)};
    case 'not':
      return {tipo:'not', a: renomearVariaveisLigadas(node.a)};
    default:
      return clonarAst(node);
  }
}

function puxarQuantificadores(node) {
  if (!node) return {quantificadores:[], matriz:null};
  if (node.tipo === 'forall' || node.tipo === 'exists') {
    const interno = puxarQuantificadores(node.a);
    return {quantificadores: [{tipo: node.tipo, var: node.var}, ...interno.quantificadores], matriz: interno.matriz};
  }
  if (node.tipo === 'and' || node.tipo === 'or') {
    const E = puxarQuantificadores(node.a);
    const D = puxarQuantificadores(node.b);
    const qs = [...E.quantificadores, ...D.quantificadores];
    const mat = {tipo: node.tipo, a: E.matriz, b: D.matriz};
    return {quantificadores: qs, matriz: mat};
  }
  if (node.tipo === 'not') {
    const P = puxarQuantificadores(node.a);
    return {quantificadores: P.quantificadores, matriz: {tipo:'not', a: P.matriz}};
  }
  return {quantificadores: [], matriz: clonarAst(node)};
}

function construirPrenex(quantificadores, matriz) {
  let node = clonarAst(matriz);
  for (let i = quantificadores.length-1;i>=0;--i) node = {tipo: quantificadores[i].tipo, var: quantificadores[i].var, a: node};
  return node;
}

function skolemizar(nodePrenex) {
  const qlist = [];
  let cur = nodePrenex;
  while (cur && (cur.tipo === 'forall' || cur.tipo === 'exists')) {
    qlist.push({tipo:cur.tipo, var: cur.var});
    cur = cur.a;
  }
  let matriz = cur;
  const prefixoUniversal = [];
  const subs = {};
  for (const q of qlist) {
    if (q.tipo === 'forall') prefixoUniversal.push(q.var);
    else {
      if (prefixoUniversal.length === 0) {
        const c = novoSk('c');
        subs[q.var] = {tipo:'func', nome:c, args: []};
      } else {
        const fname = novoSk('f');
        subs[q.var] = {tipo:'func', nome: fname, args: prefixoUniversal.map(v=>({tipo:'var', nome:v}))};
      }
    }
  }
  function aplicarSubs(node) {
    if (!node) return node;
    switch(node.tipo) {
      case 'pred':
        return {tipo:'pred', nome:node.nome, args: node.args.map(t => aplicarTermo(t))};
      case 'and':
      case 'or':
        return {tipo: node.tipo, a: aplicarSubs(node.a), b: aplicarSubs(node.b)};
      case 'not':
        return {tipo:'not', a: aplicarSubs(node.a)};
      default:
        return clonarAst(node);
    }
  }
  function aplicarTermo(t) {
    if (!t) return t;
    if (t.tipo === 'var') {
      if (subs[t.nome]) return subs[t.nome];
      return t;
    }
    if (t.tipo === 'func') return {tipo:'func', nome:t.nome, args: t.args.map(a=>aplicarTermo(a))};
    return t;
  }
  const novaMatriz = aplicarSubs(matriz);
  return novaMatriz;
}

function paraCNF(node) {
  if (!node) return node;
  if (node.tipo === 'and') return {tipo:'and', a: paraCNF(node.a), b: paraCNF(node.b)};
  if (node.tipo === 'or') {
    const A = paraCNF(node.a);
    const B = paraCNF(node.b);
    if (A.tipo === 'and') {
      return paraCNF({tipo:'and', a: {tipo:'or', a:A.a, b:B}, b: {tipo:'or', a:A.b, b:B}});
    }
    if (B.tipo === 'and') {
      return paraCNF({tipo:'and', a: {tipo:'or', a:A, b:B.a}, b: {tipo:'or', a:A, b: B.b}});
    }
    return {tipo:'or', a:A, b:B};
  }
  if (node.tipo === 'not') return {tipo:'not', a: paraCNF(node.a)};
  return clonarAst(node);
}

function paraDNF(node) {
  if (!node) return node;
  if (node.tipo === 'or') return {tipo:'or', a: paraDNF(node.a), b: paraDNF(node.b)};
  if (node.tipo === 'and') {
    const A = paraDNF(node.a);
    const B = paraDNF(node.b);
    if (A.tipo === 'or') {
      return paraDNF({tipo:'or', a:{tipo:'and', a:A.a, b:B}, b:{tipo:'and', a:A.b, b:B}});
    }
    if (B.tipo === 'or') {
      return paraDNF({tipo:'or', a:{tipo:'and', a:A, b:B.a}, b:{tipo:'and', a:A, b:B.b}});
    }
    return {tipo:'and', a:A, b:B};
  }
  if (node.tipo === 'not') return {tipo:'not', a: paraDNF(node.a)};
  return clonarAst(node);
}

function extrairClausulasCNF(node) {
  const clausulas = [];
  function coletarConj(n, out) {
    if (!n) return;
    if (n.tipo === 'and') { 
      coletarConj(n.a, out); 
      coletarConj(n.b, out); 
      return; 
    }
    out.push(n);
  }
  
  const conj = [];
  coletarConj(node, conj);
  
  for (const c of conj) {
    const lits = [];
    function coletarDisj(n, arr) {
      if (!n) return;
      if (n.tipo === 'or') { 
        coletarDisj(n.a, arr); 
        coletarDisj(n.b, arr); 
        return; 
      }
      if (n.tipo === 'not') {
        arr.push({pos: false, lit: n.a});
      } else {
        arr.push({pos: true, lit: n});
      }
    }
    coletarDisj(c, lits);
    clausulas.push(lits);
  }
  return clausulas;
}

function ehClausulaHorn(clausula) {
  let pos = 0;
  for (const l of clausula) {
    if (l.pos) pos++;
  }
  return pos <= 1;
}

function classificarClausulaHorn(clausula) {
  const posCount = clausula.filter(l => l.pos).length;
  const negCount = clausula.filter(l => !l.pos).length;
  
  if (posCount === 0) return 'goal';
  if (posCount === 1 && negCount === 0) return 'fact';
  if (posCount === 1 && negCount > 0) return 'rule';
  return 'not-horn';
}

function clausulaParaLatex(clausula) {
  if (!clausula || clausula.length === 0) return '\\text{cláusula vazia}';
  return clausula.map(l => {
    const s = astParaLatex(l.lit);
    return l.pos ? s : `\\lnot ${s}`;
  }).join(' \\lor ');
}

function clausulasParaLatex(clausulas) {
  if (!clausulas || clausulas.length === 0) return '\\text{conjunto vazio}';
  return clausulas.map(c => `(${clausulaParaLatex(c)})`).join(' \\land ');
}



const inputEl = document.getElementById('input');
const renderInput = document.getElementById('renderInput');
const stepsContainer = document.getElementById('stepsContainer');

function inserirSimbolo(s) {
  const el = inputEl;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value;
  el.value = text.slice(0,start) + s + text.slice(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + s.length;
}

function definirExemplo(s) {
  inputEl.value = s;
  atualizarRenderInput();
}

function limparTudo() {
  inputEl.value = '';
  renderInput.innerHTML = '';
  stepsContainer.innerHTML = '';
  MathJax.typesetPromise();
}

function atualizarRenderInput() {
  const raw = inputEl.value.trim();
  if (!raw) { renderInput.innerHTML = '—'; MathJax.typesetPromise(); return; }
  renderInput.innerHTML = '$$' + raw + '$$';
  MathJax.typesetPromise();
}

function adicionarPasso(titulo, latex) {
  const div = document.createElement('div');
  div.className = 'step';
  div.innerHTML = `<div class="title">${titulo}</div><div style="font-size:18px">\\(${latex}\\)</div>`;
  stepsContainer.appendChild(div);
}

function executarTudo() {
  stepsContainer.innerHTML = '';
  skContador = 0; renomearContador = 0;
  const raw = inputEl.value.trim();
  if (!raw) { 
    alert('Digite uma fórmula LaTeX primeiro.'); 
    return; 
  }
  
  renderInput.innerHTML = '$$' + raw + '$$';
  MathJax.typesetPromise();

  let ast;
  try {
    ast = analisar(raw);
    if (!ast) throw new Error('Parser retornou vazio — verifique sintaxe.');
  } catch (e) {
    adicionarPasso('Erro no parser', `\\text{${e.message || 'Entrada inválida'}}`);
    console.error(e);
    return;
  }

  try {
    adicionarPasso('Fórmula original', astParaLatex(ast));

    const semImp = eliminarImplicacoes(ast);
    adicionarPasso('Eliminar → e ↔ (implicações/equivalências)', astParaLatex(semImp));

    const nnf = paraNNF(semImp);
    adicionarPasso('NNF — Forma Normal Negativa (negações internas)', astParaLatex(nnf));

    const renomeado = renomearVariaveisLigadas(nnf);
    adicionarPasso('Renomear variáveis ligadas (alpha-conversion)', astParaLatex(renomeado));

    const puxado = puxarQuantificadores(renomeado);
    const prenex = construirPrenex(puxado.quantificadores, puxado.matriz);
    adicionarPasso('Forma Prenex (quantificadores na frente)', astParaLatex(prenex));

    const skolemizado = skolemizar(prenex);
    adicionarPasso('Skolemização (remover ∃ por funções/constantes)', astParaLatex(skolemizado));

    const cnf = paraCNF(skolemizado);
    adicionarPasso('CNF — Forma Normal Conjuntiva', astParaLatex(cnf));

    const clausulas = extrairClausulasCNF(cnf);
    const clausulasLatex = clausulasParaLatex(clausulas);
    adicionarPasso('Forma Cláusal (conjunto de cláusulas)', clausulasLatex);

    if (clausulas.length > 0) {
      let analiseHorn = [];
      let todasHorn = true;
      
      clausulas.forEach((clausula, i) => {
        const ehHorn = ehClausulaHorn(clausula);
        const tipo = classificarClausulaHorn(clausula);
        if (!ehHorn) todasHorn = false;
        
        let tipoDesc = '';
        switch(tipo) {
          case 'fact': tipoDesc = 'Fato'; break;
          case 'rule': tipoDesc = 'Regra'; break;
          case 'goal': tipoDesc = 'Goal'; break;
          default: tipoDesc = 'Não-Horn';
        }
        
        analiseHorn.push(`C_{${i+1}}: (${clausulaParaLatex(clausula)}) \\rightarrow \\text{${tipoDesc}}`);
      });
      
      const hornLatex = analiseHorn.join('\\\\');
      adicionarPasso('Análise de cláusulas de Horn', hornLatex);

      const resumo = todasHorn ? 
        '\\text{Todas as cláusulas são de Horn}' :
        '\\text{Nem todas as cláusulas são de Horn}';
      adicionarPasso('Resumo Horn', resumo);
      
    } else {
      adicionarPasso('Análise de cláusulas de Horn', '\\text{Nenhuma cláusula encontrada}');
    }

    const dnf = paraDNF(skolemizado);
    adicionarPasso('DNF — Forma Normal Disjuntiva (comparação)', astParaLatex(dnf));

  } catch (e) {
    adicionarPasso('Erro durante transformação', `\\text{${e.message || 'Erro inesperado'}}`);
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
