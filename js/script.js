function tokenizar(s) {
  s = s.replace(/\$/g, ' ').trim();
  const tokens = [];
  const padroes = [
    ["WS", /^\s+/],
    ["FORALL", /^(\\forall|∀)/],
    ["EXISTS", /^(\\exists|∃)/],
    ["NOT", /^(\\neg|¬)/],
    ["AND", /^(\\land|∧)/],
    ["OR", /^(\\lor|∨)/],
    ["IMPLIES", /^(\\rightarrow|→)/],
    ["IFF", /^(\\leftrightarrow|↔)/],
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
        if (tipo !== "WS") tokens.push({ tipo, valor: tok });
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
  const peek = () => tokens[pos] || null;
  const eat = tipo => (peek() && peek().tipo === tipo ? tokens[pos++] : null);
  const expect = tipo => {
    const t = eat(tipo);
    if (!t) throw new Error(`Esperado ${tipo}, encontrado ${peek()?.tipo || 'fim'}`);
    return t;
  };

  function formula() { return iff(); }
  function iff() {
    let left = implies();
    while (peek() && peek().tipo === "IFF") {
      eat("IFF");
      left = { tipo: 'iff', a: left, b: implies() };
    }
    return left;
  }
  function implies() {
    let left = or();
    while (peek() && peek().tipo === "IMPLIES") {
      eat("IMPLIES");
      left = { tipo: 'implies', a: left, b: implies() };
    }
    return left;
  }
  function or() {
    let left = and();
    while (peek() && peek().tipo === "OR") {
      eat("OR");
      left = { tipo: 'or', a: left, b: and() };
    }
    return left;
  }
  function and() {
    let left = unary();
    while (peek() && peek().tipo === "AND") {
      eat("AND");
      left = { tipo: 'and', a: left, b: unary() };
    }
    return left;
  }
  function unary() {
    const t = peek();
    if (!t) return null;
    if (t.tipo === "NOT") { eat("NOT"); return { tipo: 'not', a: unary() }; }
    if (t.tipo === "FORALL" || t.tipo === "EXISTS") {
      const qtipo = t.tipo === "FORALL" ? 'forall' : 'exists';
      eat(t.tipo);
      const vars = [];
      while (peek() && peek().tipo === "IDENT") vars.push(eat("IDENT").valor);
      if (!vars.length) throw new Error(`Esperado variável após ${qtipo === 'forall' ? '∀' : '∃'}`);
      if (peek() && peek().tipo === "DOT") eat("DOT");
      let node = unary();
      if (!node) throw new Error(`Esperado fórmula após quantificador`);
      for (let i = vars.length - 1; i >= 0; i--) node = { tipo: qtipo, var: vars[i], a: node };
      return node;
    }
    if (t.tipo === "LPAREN") { eat("LPAREN"); const f = formula(); expect("RPAREN"); return f; }
    if (t.tipo === "IDENT") {
      const nome = eat("IDENT").valor;
      if (peek() && peek().tipo === "LPAREN") {
        eat("LPAREN");
        const args = [];
        while (peek() && peek().tipo !== "RPAREN") {
          if (peek().tipo === "IDENT") args.push({ tipo: 'var', nome: eat("IDENT").valor });
          else if (peek().tipo === "COMMA") eat("COMMA");
          else throw new Error(`Token inesperado em argumentos: ${peek().tipo}`);
        }
        expect("RPAREN");
        return { tipo: 'pred', nome, args };
      }
      return { tipo: 'pred', nome, args: [] };
    }
    throw new Error(`Token inesperado: ${t.tipo}`);
  }

  const ast = formula();
  if (pos < tokens.length) throw new Error(`Tokens extras encontrados: ${tokens.slice(pos).map(t => t.valor).join(' ')}`);
  return ast;
}

const clone = x => JSON.parse(JSON.stringify(x));

function astParaLatex(a) {
  if (!a) return '';
  const wrap = x => !x ? '' : ['and', 'or', 'implies', 'iff'].includes(x.tipo) ? `(${astParaLatex(x)})` : astParaLatex(x);
  switch (a.tipo) {
    case 'pred': return a.args && a.args.length ? a.nome + '(' + a.args.map(termoParaLatex).join(',') + ')' : a.nome;
    case 'not': return `\\lnot ${wrap(a.a)}`;
    case 'and': return `${wrap(a.a)} \\land ${wrap(a.b)}`;
    case 'or': return `${wrap(a.a)} \\lor ${wrap(a.b)}`;
    case 'implies': return `${wrap(a.a)} \\rightarrow ${wrap(a.b)}`;
    case 'iff': return `${wrap(a.a)} \\leftrightarrow ${wrap(a.b)}`;
    case 'forall': return `\\forall ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'exists': return `\\exists ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'func': return a.args && a.args.length ? a.nome + '(' + a.args.map(termoParaLatex).join(',') + ')' : a.nome;
    case 'var': return a.nome;
    default: return '\\text{?}';
  }
}

function termoParaLatex(t) {
  if (!t) return '';
  if (t.tipo === 'var') return t.nome;
  if (t.tipo === 'func') return t.args && t.args.length ? t.nome + '(' + t.args.map(termoParaLatex).join(',') + ')' : t.nome;
  return t.nome || '?';
}

function eliminarImplicacoes(node) {
  if (!node) return node;
  switch (node.tipo) {
    case 'implies': return { tipo: 'or', a: { tipo: 'not', a: eliminarImplicacoes(node.a) }, b: eliminarImplicacoes(node.b) };
    case 'iff': return eliminarImplicacoes({ tipo: 'and', a: { tipo: 'implies', a: node.a, b: node.b }, b: { tipo: 'implies', a: node.b, b: node.a } });
    case 'and': case 'or': return { tipo: node.tipo, a: eliminarImplicacoes(node.a), b: eliminarImplicacoes(node.b) };
    case 'not': return { tipo: 'not', a: eliminarImplicacoes(node.a) };
    case 'forall': case 'exists': return { tipo: node.tipo, var: node.var, a: eliminarImplicacoes(node.a) };
    default: return clone(node);
  }
}

function paraNNF(node) {
  if (!node) return node;
  function nnf(n, neg) {
    if (!n) return null;
    if (n.tipo === 'not') return nnf(n.a, !neg);
    if (n.tipo === 'and' || n.tipo === 'or') {
      const a = nnf(n.a, neg), b = nnf(n.b, neg);
      if (neg) return n.tipo === 'and' ? { tipo: 'or', a, b } : { tipo: 'and', a, b };
      return { tipo: n.tipo, a, b };
    }
    if (n.tipo === 'forall' || n.tipo === 'exists') {
      if (neg) return { tipo: n.tipo === 'forall' ? 'exists' : 'forall', var: n.var, a: nnf(n.a, true) };
      return { tipo: n.tipo, var: n.var, a: nnf(n.a, false) };
    }
    return neg ? { tipo: 'not', a: clone(n) } : clone(n);
  }
  return nnf(node, false);
}

let skContador = 0, renomearContador = 0;
const novoSk = (p = 'sk') => p + (++skContador);
const novaVar = (p = 'v') => p + (++renomearContador);

function substituir(node, nomeVar, substituto) {
  if (!node) return node;
  switch (node.tipo) {
    case 'pred':
      return { tipo: 'pred', nome: node.nome, args: node.args.map(t => t.tipo === 'var' && t.nome === nomeVar ? substituto : t) };
    case 'forall': case 'exists':
      if (node.var === nomeVar) return clone(node);
      return { tipo: node.tipo, var: node.var, a: substituir(node.a, nomeVar, substituto) };
    case 'and': case 'or': return { tipo: node.tipo, a: substituir(node.a, nomeVar, substituto), b: substituir(node.b, nomeVar, substituto) };
    case 'not': return { tipo: 'not', a: substituir(node.a, nomeVar, substituto) };
    default: return clone(node);
  }
}

function renomearVariaveisLigadas(node) {
  if (!node) return node;
  switch (node.tipo) {
    case 'forall': case 'exists': {
      const nv = novaVar(node.var + '_');
      return { tipo: node.tipo, var: nv, a: renomearVariaveisLigadas(substituir(node.a, node.var, { tipo: 'var', nome: nv })) };
    }
    case 'and': case 'or': return { tipo: node.tipo, a: renomearVariaveisLigadas(node.a), b: renomearVariaveisLigadas(node.b) };
    case 'not': return { tipo: 'not', a: renomearVariaveisLigadas(node.a) };
    default: return clone(node);
  }
}

function puxarQuantificadores(node) {
  if (!node) return { quantificadores: [], matriz: null };
  if (node.tipo === 'forall' || node.tipo === 'exists') {
    const interno = puxarQuantificadores(node.a);
    return { quantificadores: [{ tipo: node.tipo, var: node.var }, ...interno.quantificadores], matriz: interno.matriz };
  }
  if (node.tipo === 'and' || node.tipo === 'or') {
    const E = puxarQuantificadores(node.a), D = puxarQuantificadores(node.b);
    return { quantificadores: [...E.quantificadores, ...D.quantificadores], matriz: { tipo: node.tipo, a: E.matriz, b: D.matriz } };
  }
  if (node.tipo === 'not') {
    const P = puxarQuantificadores(node.a);
    return { quantificadores: P.quantificadores, matriz: { tipo: 'not', a: P.matriz } };
  }
  return { quantificadores: [], matriz: clone(node) };
}

function construirPrenex(quantificadores, matriz) {
  let node = clone(matriz);
  for (let i = quantificadores.length - 1; i >= 0; --i)
    node = { tipo: quantificadores[i].tipo, var: quantificadores[i].var, a: node };
  return node;
}

function skolemizar(nodePrenex) {
  const qlist = [];
  let cur = nodePrenex;
  while (cur && (cur.tipo === 'forall' || cur.tipo === 'exists')) {
    qlist.push({ tipo: cur.tipo, var: cur.var });
    cur = cur.a;
  }
  let matriz = cur;
  const prefixoUniversal = [];
  const subs = {};
  for (const q of qlist) {
    if (q.tipo === 'forall') prefixoUniversal.push(q.var);
    else {
      subs[q.var] = prefixoUniversal.length === 0
        ? { tipo: 'func', nome: novoSk('c'), args: [] }
        : { tipo: 'func', nome: novoSk('f'), args: prefixoUniversal.map(v => ({ tipo: 'var', nome: v })) };
    }
  }
  function aplicarSubs(node) {
    if (!node) return node;
    switch (node.tipo) {
      case 'pred': return { tipo: 'pred', nome: node.nome, args: node.args.map(aplicarTermo) };
      case 'and': case 'or': return { tipo: node.tipo, a: aplicarSubs(node.a), b: aplicarSubs(node.b) };
      case 'not': return { tipo: 'not', a: aplicarSubs(node.a) };
      default: return clone(node);
    }
  }
  function aplicarTermo(t) {
    if (!t) return t;
    if (t.tipo === 'var') return subs[t.nome] ? subs[t.nome] : t;
    if (t.tipo === 'func') return { tipo: 'func', nome: t.nome, args: t.args.map(aplicarTermo) };
    return t;
  }
  return aplicarSubs(matriz);
}

function paraCNF(node) {
  if (!node) return node;
  if (node.tipo === 'and') return { tipo: 'and', a: paraCNF(node.a), b: paraCNF(node.b) };
  if (node.tipo === 'or') {
    const A = paraCNF(node.a), B = paraCNF(node.b);
    if (A.tipo === 'and') return paraCNF({ tipo: 'and', a: { tipo: 'or', a: A.a, b: B }, b: { tipo: 'or', a: A.b, b: B } });
    if (B.tipo === 'and') return paraCNF({ tipo: 'and', a: { tipo: 'or', a: A, b: B.a }, b: { tipo: 'or', a: A, b: B.b } });
    return { tipo: 'or', a: A, b: B };
  }
  if (node.tipo === 'not') return { tipo: 'not', a: paraCNF(node.a) };
  return clone(node);
}

function paraDNF(node) {
  if (!node) return node;
  if (node.tipo === 'or') return { tipo: 'or', a: paraDNF(node.a), b: paraDNF(node.b) };
  if (node.tipo === 'and') {
    const A = paraDNF(node.a), B = paraDNF(node.b);
    if (A.tipo === 'or') return paraDNF({ tipo: 'or', a: { tipo: 'and', a: A.a, b: B }, b: { tipo: 'and', a: A.b, b: B } });
    if (B.tipo === 'or') return paraDNF({ tipo: 'or', a: { tipo: 'and', a: A, b: B.a }, b: { tipo: 'and', a: A, b: B.b } });
    return { tipo: 'and', a: A, b: B };
  }
  if (node.tipo === 'not') return { tipo: 'not', a: paraDNF(node.a) };
  return clone(node);
}

function extrairClausulasCNF(node) {
  const clausulas = [];
  function coletarConj(n, out) {
    if (!n) return;
    if (n.tipo === 'and') { coletarConj(n.a, out); coletarConj(n.b, out); return; }
    out.push(n);
  }
  const conj = [];
  coletarConj(node, conj);
  for (const c of conj) {
    const lits = [];
    function coletarDisj(n, arr) {
      if (!n) return;
      if (n.tipo === 'or') { coletarDisj(n.a, arr); coletarDisj(n.b, arr); return; }
      arr.push(n.tipo === 'not' ? { pos: false, lit: n.a } : { pos: true, lit: n });
    }
    coletarDisj(c, lits);
    clausulas.push(lits);
  }
  return clausulas;
}

function ehClausulaHorn(clausula) {
  return clausula.filter(l => l.pos).length <= 1;
}

function classificarClausulaHorn(clausula) {
  const posCount = clausula.filter(l => l.pos).length;
  const negCount = clausula.length - posCount;
  if (posCount === 0) return 'goal';
  if (posCount === 1 && negCount === 0) return 'fact';
  if (posCount === 1 && negCount > 0) return 'rule';
  return 'not-horn';
}

function clausulaParaLatex(clausula) {
  if (!clausula || !clausula.length) return '\\text{cláusula vazia}';
  return clausula.map(l => l.pos ? astParaLatex(l.lit) : `\\lnot ${astParaLatex(l.lit)}`).join(' \\lor ');
}

function clausulasParaLatex(clausulas) {
  if (!clausulas || !clausulas.length) return '\\text{conjunto vazio}';
  return clausulas.map(c => `(${clausulaParaLatex(c)})`).join(' \\land ');
}

const inputEl = document.getElementById('input');
const renderInput = document.getElementById('renderInput');
const stepsContainer = document.getElementById('stepsContainer');

function inserirSimbolo(s) {
  const el = inputEl;
  const start = el.selectionStart, end = el.selectionEnd, text = el.value;
  el.value = text.slice(0, start) + s + text.slice(end);
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
  renderInput.innerHTML = raw ? '$$' + raw + '$$' : '—';
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
  if (!raw) { alert('Digite uma fórmula LaTeX primeiro.'); return; }
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
    const passos = [
      ['Fórmula original', astParaLatex(ast)],
      ['Eliminar → e ↔ (implicações/equivalências)', astParaLatex(eliminarImplicacoes(ast))],
      ['NNF — Forma Normal Negativa (negações internas)', astParaLatex(paraNNF(eliminarImplicacoes(ast)))],
      ['Renomear variáveis ligadas (alpha-conversion)', astParaLatex(renomearVariaveisLigadas(paraNNF(eliminarImplicacoes(ast))))],
    ];
    let renomeado = renomearVariaveisLigadas(paraNNF(eliminarImplicacoes(ast)));
    let puxado = puxarQuantificadores(renomeado);
    let prenex = construirPrenex(puxado.quantificadores, puxado.matriz);
    passos.push(['Forma Prenex (quantificadores na frente)', astParaLatex(prenex)]);
    let skolemizado = skolemizar(prenex);
    passos.push(['Skolemização (remover ∃ por funções/constantes)', astParaLatex(skolemizado)]);
    let cnf = paraCNF(skolemizado);
    passos.push(['CNF — Forma Normal Conjuntiva', astParaLatex(cnf)]);
    let clausulas = extrairClausulasCNF(cnf);
    passos.push(['Forma Cláusal (conjunto de cláusulas)', clausulasParaLatex(clausulas)]);

    passos.forEach(([titulo, latex]) => adicionarPasso(titulo, latex));

    if (clausulas.length) {
      let analiseHorn = [];
      let todasHorn = true;
      clausulas.forEach((clausula, i) => {
        const ehHorn = ehClausulaHorn(clausula);
        const tipo = classificarClausulaHorn(clausula);
        if (!ehHorn) todasHorn = false;
        let tipoDesc = { fact: 'Fato', rule: 'Regra', goal: 'Goal', 'not-horn': 'Não-Horn' }[tipo];
        analiseHorn.push(`C_{${i + 1}}: (${clausulaParaLatex(clausula)}) \\rightarrow \\text{${tipoDesc}}`);
      });
      adicionarPasso('Análise de cláusulas de Horn', analiseHorn.join('\\\\'));
      adicionarPasso('Resumo Horn', todasHorn ? '\\text{Todas as cláusulas são de Horn}' : '\\text{Nem todas as cláusulas são de Horn}');
    } else {
      adicionarPasso('Análise de cláusulas de Horn', '\\text{Nenhuma cláusula encontrada}');
    }

    adicionarPasso('DNF — Forma Normal Disjuntiva (comparação)', astParaLatex(paraDNF(skolemizado)));
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
