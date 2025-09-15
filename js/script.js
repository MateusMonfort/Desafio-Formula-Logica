/**
 * Tokeniza a string de entrada em uma lista de tokens reconhecidos
 * @param {string} s - String LaTeX de entrada
 * @returns {Array} Lista de tokens com tipo e valor
 */
function tokenizar(s) {
  // Remove caracteres $ e espaços extras
  s = s.replace(/\$/g, ' ').trim();
  const tokens = [];
  
  // Define padrões de reconhecimento para cada tipo de token
  const padroes = [
    ["WS", /^\s+/],                                    // Espaços em branco
    ["FORALL", /^(\\forall|∀)/],                      // Quantificador universal
    ["EXISTS", /^(\\exists|∃)/],                      // Quantificador existencial
    ["NOT", /^(\\neg|¬|~|!)/],                        // Negação lógica
    ["AND", /^(\\land|∧|&)/],                         // Conjunção lógica
    ["OR", /^(\\lor|∨|\|)/],                          // Disjunção lógica
    ["IMPLIES", /^(\\rightarrow|\\to|→|->)/],         // Implicação
    ["IFF", /^(\\leftrightarrow|↔|<->|<=>)/],         // Equivalência
    ["LPAREN", /^\(/],                                // Parêntese esquerdo
    ["RPAREN", /^\)/],                                // Parêntese direito
    ["COMMA", /^,/],                                  // Vírgula
    ["DOT", /^\./],                                   // Ponto
    ["IDENT", /^[A-Za-z_][A-Za-z0-9_]*/]             // Identificadores (variáveis/predicados)
  ];
  
  let i = 0;
  // Percorre toda a string procurando por padrões
  while (i < s.length) {
    let matched = false;
    // Testa cada padrão na posição atual
    for (const [tipo, re] of padroes) {
      const m = s.slice(i).match(re);
      if (m) {
        matched = true;
        const tok = m[0];
        // Adiciona token se não for espaço em branco
        if (tipo !== "WS") tokens.push({ tipo, valor: tok });
        i += tok.length;
        break;
      }
    }
    // Se nenhum padrão coincidiu, pula um caractere
    if (!matched) i++;
  }
  return tokens;
}

/**
 * Realiza o parsing dos tokens e retorna a AST (árvore sintática abstrata)
 * Implementa uma gramática recursiva descendente para lógica de primeira ordem
 * @param {string} s - String LaTeX de entrada
 * @returns {Object} AST da fórmula
 */
function analisar(s) {
  const tokens = tokenizar(s);
  let pos = 0;
  
  // Funções auxiliares para navegação nos tokens
  const peek = () => tokens[pos] || null;                    // Espia próximo token sem consumir
  const eat = tipo => (peek() && peek().tipo === tipo ? tokens[pos++] : null);  // Consome token se for do tipo esperado
  const expect = tipo => {                                   // Consome token obrigatório
    const t = eat(tipo);
    if (!t) throw new Error(`Esperado ${tipo}, encontrado ${peek()?.tipo || 'fim'}`);
    return t;
  };

  // Funções de parsing seguindo a precedência de operadores
  function formula() { return iff(); }                       // Ponto de entrada principal
  
  // Equivalência (↔) - menor precedência
  function iff() {
    let left = implies();
    while (peek() && peek().tipo === "IFF") {
      eat("IFF");
      left = { tipo: 'iff', a: left, b: implies() };
    }
    return left;
  }
  
  // Implicação (→) - associativa à direita
  function implies() {
    let left = or();
    while (peek() && peek().tipo === "IMPLIES") {
      eat("IMPLIES");
      left = { tipo: 'implies', a: left, b: implies() };
    }
    return left;
  }
  
  // Disjunção (∨)
  function or() {
    let left = and();
    while (peek() && peek().tipo === "OR") {
      eat("OR");
      left = { tipo: 'or', a: left, b: and() };
    }
    return left;
  }
  
  // Conjunção (∧)
  function and() {
    let left = unary();
    while (peek() && peek().tipo === "AND") {
      eat("AND");
      left = { tipo: 'and', a: left, b: unary() };
    }
    return left;
  }
  
  // Operadores unários e expressões atômicas
  function unary() {
    const t = peek();
    if (!t) return null;
    
    // Negação (¬)
    if (t.tipo === "NOT") { 
      eat("NOT"); 
      return { tipo: 'not', a: unary() }; 
    }
    
    // Quantificadores (∀, ∃)
    if (t.tipo === "FORALL" || t.tipo === "EXISTS") {
      const qtipo = t.tipo === "FORALL" ? 'forall' : 'exists';
      eat(t.tipo);
      
      // Coleta todas as variáveis quantificadas
      const vars = [];
      while (peek() && peek().tipo === "IDENT") vars.push(eat("IDENT").valor);
      if (!vars.length) throw new Error(`Esperado variável após ${qtipo === 'forall' ? '∀' : '∃'}`);
      
      // Ponto opcional após quantificador
      if (peek() && peek().tipo === "DOT") eat("DOT");
      
      let node = unary();
      if (!node) throw new Error(`Esperado fórmula após quantificador`);
      
      // Constrói nós de quantificação aninhados (da direita para esquerda)
      for (let i = vars.length - 1; i >= 0; i--) 
        node = { tipo: qtipo, var: vars[i], a: node };
      return node;
    }
    
    // Expressões entre parênteses
    if (t.tipo === "LPAREN") { 
      eat("LPAREN"); 
      const f = formula(); 
      expect("RPAREN"); 
      return f; 
    }
    
    // Predicados e constantes
    if (t.tipo === "IDENT") {
      const nome = eat("IDENT").valor;
      
      // Predicado com argumentos P(x,y,z)
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
      
      // Predicado sem argumentos P
      return { tipo: 'pred', nome, args: [] };
    }
    
    throw new Error(`Token inesperado: ${t.tipo}`);
  }

  // Constrói AST e verifica se todos os tokens foram consumidos
  const ast = formula();
  if (pos < tokens.length) 
    throw new Error(`Tokens extras encontrados: ${tokens.slice(pos).map(t => t.valor).join(' ')}`);
  return ast;
}

/**
 * Clona um objeto (usado para AST)
 * Necessário para evitar mutações acidentais durante transformações
 */
const clone = x => JSON.parse(JSON.stringify(x));

/**
 * Converte AST para string LaTeX renderizável
 * @param {Object} a - Nó da AST
 * @returns {string} Expressão LaTeX
 */
function astParaLatex(a) {
  if (!a) return '';
  
  // Função auxiliar para adicionar parênteses quando necessário
  const wrap = x => !x ? '' : ['and', 'or', 'implies', 'iff'].includes(x.tipo) ? `(${astParaLatex(x)})` : astParaLatex(x);
  
  switch (a.tipo) {
    case 'pred': 
      // Predicado: P ou P(x,y,z)
      return a.args && a.args.length ? a.nome + '(' + a.args.map(termoParaLatex).join(',') + ')' : a.nome;
    case 'not': 
      // Negação: ¬P
      return `\\lnot ${wrap(a.a)}`;
    case 'and': 
      // Conjunção: P ∧ Q
      return `${wrap(a.a)} \\land ${wrap(a.b)}`;
    case 'or': 
      // Disjunção: P ∨ Q
      return `${wrap(a.a)} \\lor ${wrap(a.b)}`;
    case 'implies': 
      // Implicação: P → Q
      return `${wrap(a.a)} \\rightarrow ${wrap(a.b)}`;
    case 'iff': 
      // Equivalência: P ↔ Q
      return `${wrap(a.a)} \\leftrightarrow ${wrap(a.b)}`;
    case 'forall': 
      // Quantificador universal: ∀x P(x)
      return `\\forall ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'exists': 
      // Quantificador existencial: ∃x P(x)
      return `\\exists ${a.var} \\, ${astParaLatex(a.a)}`;
    case 'func': 
      // Função Skolem: f(x,y) ou constante c
      return a.args && a.args.length ? a.nome + '(' + a.args.map(termoParaLatex).join(',') + ')' : a.nome;
    case 'var': 
      // Variável: x
      return a.nome;
    default: 
      return '\\text{?}';
  }
}

/**
 * Converte um termo da AST para LaTeX
 * @param {Object} t - Termo (variável ou função)
 * @returns {string} Representação LaTeX do termo
 */
function termoParaLatex(t) {
  if (!t) return '';
  if (t.tipo === 'var') return t.nome;                       // Variável simples
  if (t.tipo === 'func') 
    return t.args && t.args.length ? 
      t.nome + '(' + t.args.map(termoParaLatex).join(',') + ')' : t.nome;  // Função com argumentos
  return t.nome || '?';
}

/**
 * Elimina implicações (→) e equivalências (↔) da AST
 * Transformações: A → B ≡ ¬A ∨ B; A ↔ B ≡ (A → B) ∧ (B → A)
 * @param {Object} node - Nó da AST
 * @returns {Object} AST sem implicações/equivalências
 */
function eliminarImplicacoes(node) {
  if (!node) return node;
  switch (node.tipo) {
    case 'implies': 
      // A → B se torna ¬A ∨ B
      return { tipo: 'or', a: { tipo: 'not', a: eliminarImplicacoes(node.a) }, b: eliminarImplicacoes(node.b) };
    case 'iff': 
      // A ↔ B se torna (A → B) ∧ (B → A)
      return eliminarImplicacoes({ 
        tipo: 'and', 
        a: { tipo: 'implies', a: node.a, b: node.b }, 
        b: { tipo: 'implies', a: node.b, b: node.a } 
      });
    case 'and': case 'or': 
      // Recursão em operadores binários
      return { tipo: node.tipo, a: eliminarImplicacoes(node.a), b: eliminarImplicacoes(node.b) };
    case 'not': 
      // Recursão em negação
      return { tipo: 'not', a: eliminarImplicacoes(node.a) };
    case 'forall': case 'exists': 
      // Recursão em quantificadores
      return { tipo: node.tipo, var: node.var, a: eliminarImplicacoes(node.a) };
    default: 
      // Predicados e variáveis permanecem inalterados
      return clone(node);
  }
}

/**
 * Converte AST para Forma Normal Negativa (NNF)
 * Move todas as negações para os átomos usando leis de De Morgan
 * @param {Object} node - Nó da AST
 * @returns {Object} AST em NNF
 */
function paraNNF(node) {
  if (!node) return node;
  
  /**
   * Função interna recursiva que aplica NNF
   * @param {Object} n - Nó atual
   * @param {boolean} neg - Se está sob negação
   */
  function nnf(n, neg) {
    if (!n) return null;
    
    // Dupla negação: ¬¬A = A
    if (n.tipo === 'not') return nnf(n.a, !neg);
    
    // Leis de De Morgan para conectivos
    if (n.tipo === 'and' || n.tipo === 'or') {
      const a = nnf(n.a, neg), b = nnf(n.b, neg);
      if (neg) {
        // ¬(A ∧ B) = ¬A ∨ ¬B; ¬(A ∨ B) = ¬A ∧ ¬B
        return n.tipo === 'and' ? { tipo: 'or', a, b } : { tipo: 'and', a, b };
      }
      return { tipo: n.tipo, a, b };
    }
    
    // Leis de De Morgan para quantificadores
    if (n.tipo === 'forall' || n.tipo === 'exists') {
      if (neg) {
        // ¬∀x P(x) = ∃x ¬P(x); ¬∃x P(x) = ∀x ¬P(x)
        return { tipo: n.tipo === 'forall' ? 'exists' : 'forall', var: n.var, a: nnf(n.a, true) };
      }
      return { tipo: n.tipo, var: n.var, a: nnf(n.a, false) };
    }
    
    // Átomos: aplica negação se necessário
    return neg ? { tipo: 'not', a: clone(n) } : clone(n);
  }
  return nnf(node, false);
}

// Contadores globais para geração de nomes únicos
let skContador = 0, renomearContador = 0;

/**
 * Gera nome único para função de Skolem
 * @param {string} p - Prefixo (padrão: 'sk')
 * @returns {string} Nome único
 */
const novoSk = (p = 'sk') => p + (++skContador);

/**
 * Gera nome único para variável nova
 * @param {string} p - Prefixo (padrão: 'v')
 * @returns {string} Nome único
 */
const novaVar = (p = 'v') => p + (++renomearContador);

/**
 * Substitui todas as ocorrências de uma variável por um termo na AST
 * @param {Object} node - Nó da AST
 * @param {string} nomeVar - Nome da variável a substituir
 * @param {Object} substituto - Termo substituto
 * @returns {Object} AST com substituições aplicadas
 */
function substituir(node, nomeVar, substituto) {
  if (!node) return node;
  switch (node.tipo) {
    case 'pred':
      // Substitui argumentos do predicado
      return { 
        tipo: 'pred', 
        nome: node.nome, 
        args: node.args.map(t => t.tipo === 'var' && t.nome === nomeVar ? substituto : t) 
      };
    case 'forall': case 'exists':
      // Não substitui variável ligada pelo mesmo quantificador
      if (node.var === nomeVar) return clone(node);
      return { tipo: node.tipo, var: node.var, a: substituir(node.a, nomeVar, substituto) };
    case 'and': case 'or': 
      // Recursão em ambos os lados
      return { tipo: node.tipo, a: substituir(node.a, nomeVar, substituto), b: substituir(node.b, nomeVar, substituto) };
    case 'not': 
      // Recursão na subexpressão
      return { tipo: 'not', a: substituir(node.a, nomeVar, substituto) };
    default: 
      return clone(node);
  }
}

/**
 * Renomeia variáveis ligadas na AST para evitar conflitos (alpha-conversion)
 * @param {Object} node - Nó da AST
 * @returns {Object} AST com variáveis renomeadas
 */
function renomearVariaveisLigadas(node) {
  if (!node) return node;
  switch (node.tipo) {
    case 'forall': case 'exists': {
      // Gera novo nome único para a variável
      const nv = novaVar(node.var + '_');
      return { 
        tipo: node.tipo, 
        var: nv, 
        a: renomearVariaveisLigadas(substituir(node.a, node.var, { tipo: 'var', nome: nv })) 
      };
    }
    case 'and': case 'or': 
      return { tipo: node.tipo, a: renomearVariaveisLigadas(node.a), b: renomearVariaveisLigadas(node.b) };
    case 'not': 
      return { tipo: 'not', a: renomearVariaveisLigadas(node.a) };
    default: 
      return clone(node);
  }
}

/**
 * Extrai quantificadores para frente (conversão prenex) e retorna matriz e lista de quantificadores
 * @param {Object} node - Nó da AST
 * @returns {Object} {quantificadores: Array, matriz: Object}
 */
function puxarQuantificadores(node) {
  if (!node) return { quantificadores: [], matriz: null };
  
  // Quantificador encontrado: adiciona à lista e continua
  if (node.tipo === 'forall' || node.tipo === 'exists') {
    const interno = puxarQuantificadores(node.a);
    return { 
      quantificadores: [{ tipo: node.tipo, var: node.var }, ...interno.quantificadores], 
      matriz: interno.matriz 
    };
  }
  
  // Conectivos binários: coleta quantificadores de ambos os lados
  if (node.tipo === 'and' || node.tipo === 'or') {
    const E = puxarQuantificadores(node.a), D = puxarQuantificadores(node.b);
    return { 
      quantificadores: [...E.quantificadores, ...D.quantificadores], 
      matriz: { tipo: node.tipo, a: E.matriz, b: D.matriz } 
    };
  }
  
  // Negação: extrai quantificadores da subexpressão
  if (node.tipo === 'not') {
    const P = puxarQuantificadores(node.a);
    return { quantificadores: P.quantificadores, matriz: { tipo: 'not', a: P.matriz } };
  }
  
  // Átomo: sem quantificadores
  return { quantificadores: [], matriz: clone(node) };
}

/**
 * Reconstrói AST na forma prenex usando quantificadores e matriz
 * @param {Array} quantificadores - Lista de quantificadores
 * @param {Object} matriz - Matriz sem quantificadores
 * @returns {Object} AST em forma prenex
 */
function construirPrenex(quantificadores, matriz) {
  let node = clone(matriz);
  // Constrói quantificadores de dentro para fora
  for (let i = quantificadores.length - 1; i >= 0; --i)
    node = { tipo: quantificadores[i].tipo, var: quantificadores[i].var, a: node };
  return node;
}

/**
 * Realiza skolemização na AST prenex (remove quantificadores existenciais)
 * Substitui variáveis existenciais por funções que dependem das universais precedentes
 * @param {Object} nodePrenex - AST em forma prenex
 * @returns {Object} AST skolemizada
 */
function skolemizar(nodePrenex) {
  // Extrai lista de quantificadores
  const qlist = [];
  let cur = nodePrenex;
  while (cur && (cur.tipo === 'forall' || cur.tipo === 'exists')) {
    qlist.push({ tipo: cur.tipo, var: cur.var });
    cur = cur.a;
  }
  let matriz = cur;
  
  // Processa quantificadores sequencialmente
  const prefixoUniversal = [];  // Variáveis universais precedentes
  const subs = {};              // Mapa de substituições
  
  for (const q of qlist) {
    if (q.tipo === 'forall') {
      // Adiciona à lista de universais
      prefixoUniversal.push(q.var);
    } else {
      // Existencial: cria função/constante Skolem
      subs[q.var] = prefixoUniversal.length === 0
        ? { tipo: 'func', nome: novoSk('c'), args: [] }              // Constante se não há universais
        : { tipo: 'func', nome: novoSk('f'), args: prefixoUniversal.map(v => ({ tipo: 'var', nome: v })) };  // Função das universais
    }
  }
  
  /**
   * Aplica substituições Skolem na AST
   */
  function aplicarSubs(node) {
    if (!node) return node;
    switch (node.tipo) {
      case 'pred': 
        return { tipo: 'pred', nome: node.nome, args: node.args.map(aplicarTermo) };
      case 'and': case 'or': 
        return { tipo: node.tipo, a: aplicarSubs(node.a), b: aplicarSubs(node.b) };
      case 'not': 
        return { tipo: 'not', a: aplicarSubs(node.a) };
      default: 
        return clone(node);
    }
  }
  
  /**
   * Aplica substituições em termos
   */
  function aplicarTermo(t) {
    if (!t) return t;
    if (t.tipo === 'var') return subs[t.nome] ? subs[t.nome] : t;      // Substitui se existe mapeamento
    if (t.tipo === 'func') return { tipo: 'func', nome: t.nome, args: t.args.map(aplicarTermo) };  // Recursão em argumentos
    return t;
  }
  
  return aplicarSubs(matriz);
}

/**
 * Converte AST para Forma Normal Conjuntiva (CNF)
 * Aplica distributividade: A ∨ (B ∧ C) = (A ∨ B) ∧ (A ∨ C)
 * @param {Object} node - Nó da AST
 * @returns {Object} AST em CNF
 */
function paraCNF(node) {
  if (!node) return node;
  
  // Conjunção: recursão direta
  if (node.tipo === 'and') return { tipo: 'and', a: paraCNF(node.a), b: paraCNF(node.b) };
  
  // Disjunção: aplicar distributividade se necessário
  if (node.tipo === 'or') {
    const A = paraCNF(node.a), B = paraCNF(node.b);
    
    // A ∨ (B ∧ C) = (A ∨ B) ∧ (A ∨ C)
    if (A.tipo === 'and') 
      return paraCNF({ tipo: 'and', a: { tipo: 'or', a: A.a, b: B }, b: { tipo: 'or', a: A.b, b: B } });
    
    // (B ∧ C) ∨ A = (B ∨ A) ∧ (C ∨ A)
    if (B.tipo === 'and') 
      return paraCNF({ tipo: 'and', a: { tipo: 'or', a: A, b: B.a }, b: { tipo: 'or', a: A, b: B.b } });
    
    return { tipo: 'or', a: A, b: B };
  }
  
  // Negação e átomos: inalterados
  if (node.tipo === 'not') return { tipo: 'not', a: paraCNF(node.a) };
  return clone(node);
}

/**
 * Converte AST para Forma Normal Disjuntiva (DNF)
 * Aplica distributividade: A ∧ (B ∨ C) = (A ∧ B) ∨ (A ∧ C)
 * @param {Object} node - Nó da AST
 * @returns {Object} AST em DNF
 */
function paraDNF(node) {
  if (!node) return node;
  
  // Disjunção: recursão direta
  if (node.tipo === 'or') return { tipo: 'or', a: paraDNF(node.a), b: paraDNF(node.b) };
  
  // Conjunção: aplicar distributividade se necessário
  if (node.tipo === 'and') {
    const A = paraDNF(node.a), B = paraDNF(node.b);
    
    // A ∧ (B ∨ C) = (A ∧ B) ∨ (A ∧ C)
    if (A.tipo === 'or') 
      return paraDNF({ tipo: 'or', a: { tipo: 'and', a: A.a, b: B }, b: { tipo: 'and', a: A.b, b: B } });
    
    // (B ∨ C) ∧ A = (B ∧ A) ∨ (C ∧ A)
    if (B.tipo === 'or') 
      return paraDNF({ tipo: 'or', a: { tipo: 'and', a: A, b: B.a }, b: { tipo: 'and', a: A, b: B.b } });
    
    return { tipo: 'and', a: A, b: B };
  }
  
  // Negação e átomos: inalterados
  if (node.tipo === 'not') return { tipo: 'not', a: paraDNF(node.a) };
  return clone(node);
}

/**
 * Extrai as cláusulas da AST em CNF
 * Separa conjunções no nível superior e disjunções dentro de cada cláusula
 * @param {Object} node - AST em CNF
 * @returns {Array} Array de cláusulas, cada uma sendo array de literais
 */
function extrairClausulasCNF(node) {
  const clausulas = [];
  
  /**
   * Coleta todos os termos unidos por conjunção
   */
  function coletarConj(n, out) {
    if (!n) return;
    if (n.tipo === 'and') { 
      coletarConj(n.a, out); 
      coletarConj(n.b, out); 
      return; 
    }
    out.push(n);
  }
  
  // Separa em cláusulas (termos da conjunção principal)
  const conj = [];
  coletarConj(node, conj);
  
  // Para cada cláusula, extrai literais
  for (const c of conj) {
    const lits = [];
    
    /**
     * Coleta todos os literais unidos por disjunção
     */
    function coletarDisj(n, arr) {
      if (!n) return;
      if (n.tipo === 'or') { 
        coletarDisj(n.a, arr); 
        coletarDisj(n.b, arr); 
        return; 
      }
      // Literal: positivo ou negativo
      arr.push(n.tipo === 'not' ? { pos: false, lit: n.a } : { pos: true, lit: n });
    }
    
    coletarDisj(c, lits);
    clausulas.push(lits);
  }
  return clausulas;
}

/**
 * Verifica se uma cláusula é de Horn
 * Cláusula de Horn: no máximo um literal positivo
 * @param {Array} clausula - Array de literais {pos: boolean, lit: Object}
 * @returns {boolean} True se for cláusula de Horn
 */
function ehClausulaHorn(clausula) {
  return clausula.filter(l => l.pos).length <= 1;
}

/**
 * Classifica o tipo de cláusula de Horn
 * @param {Array} clausula - Array de literais
 * @returns {string} Tipo: 'fact', 'rule', 'goal', ou 'not-horn'
 */
function classificarClausulaHorn(clausula) {
  const posCount = clausula.filter(l => l.pos).length;    // Literais positivos
  const negCount = clausula.length - posCount;            // Literais negativos
  
  if (posCount === 0) return 'goal';                      // Apenas negativos: ¬P ∨ ¬Q
  if (posCount === 1 && negCount === 0) return 'fact';    // Apenas um positivo: P
  if (posCount === 1 && negCount > 0) return 'rule';      // Um positivo + negativos: ¬P ∨ ¬Q ∨ R
  return 'not-horn';                                      // Mais de um positivo
}

/**
 * Converte uma cláusula para representação LaTeX
 * @param {Array} clausula - Array de literais
 * @returns {string} Representação LaTeX da cláusula
 */
function clausulaParaLatex(clausula) {
  if (!clausula || !clausula.length) return '\\text{cláusula vazia}';
  return clausula.map(l => l.pos ? astParaLatex(l.lit) : `\\lnot ${astParaLatex(l.lit)}`).join(' \\lor ');
}

/**
 * Converte um conjunto de cláusulas para representação LaTeX
 * @param {Array} clausulas - Array de cláusulas
 * @returns {string} Representação LaTeX do conjunto
 */
function clausulasParaLatex(clausulas) {
  if (!clausulas || !clausulas.length) return '\\text{conjunto vazio}';
  return clausulas.map(c => `(${clausulaParaLatex(c)})`).join(' \\land ');
}

// Elementos DOM globais
const inputEl = document.getElementById('input');
const renderInput = document.getElementById('renderInput');
const stepsContainer = document.getElementById('stepsContainer');

/**
 * Insere símbolo LaTeX na posição do cursor do textarea
 * @param {string} s - Símbolo LaTeX a inserir
 */
function inserirSimbolo(s) {
  const el = inputEl;
  const start = el.selectionStart, end = el.selectionEnd, text = el.value;
  // Insere texto na posição do cursor
  el.value = text.slice(0, start) + s + text.slice(end);
  el.focus();
  // Reposiciona cursor após o texto inserido
  el.selectionStart = el.selectionEnd = start + s.length;
}

/**
 * Define exemplo rápido no textarea
 * @param {string} s - Fórmula LaTeX de exemplo
 */
function definirExemplo(s) {
  inputEl.value = s;
  atualizarRenderInput();
}

/**
 * Limpa todos os campos e resultados da interface
 */
function limparTudo() {
  inputEl.value = '';
  renderInput.innerHTML = '';
  stepsContainer.innerHTML = '';
  MathJax.typesetPromise();
}

/**
 * Atualiza a renderização da fórmula de entrada em tempo real
 */
function atualizarRenderInput() {
  const raw = inputEl.value.trim();
  // Renderiza LaTeX ou mostra traço se vazio
  renderInput.innerHTML = raw ? '$$' + raw + '$$' : '—';
  MathJax.typesetPromise();
}

/**
 * Adiciona um passo de transformação ao painel de saída
 * @param {string} titulo - Título do passo
 * @param {string} latex - Conteúdo LaTeX do passo
 */
function adicionarPasso(titulo, latex) {
  const div = document.createElement('div');
  div.className = 'step';
  div.innerHTML = `<div class="title">${titulo}</div><div style="font-size:18px">\\(${latex}\\)</div>`;
  stepsContainer.appendChild(div);
}

/**
 * Executa todas as transformações e exibe os passos sequencialmente
 * Função principal que orquestra todo o processo de transformação
 */
function executarTudo() {
  // Limpa resultados anteriores
  stepsContainer.innerHTML = '';
  skContador = 0; renomearContador = 0;
  
  const raw = inputEl.value.trim();
  if (!raw) { 
    alert('Digite uma fórmula LaTeX primeiro.'); 
    return; 
  }
  
  // Atualiza renderização da entrada
  renderInput.innerHTML = '$$' + raw + '$$';
  MathJax.typesetPromise();

  let ast;
  try {
    // Fase 1: Parsing
    ast = analisar(raw);
    if (!ast) throw new Error('Parser retornou vazio — verifique sintaxe.');
  } catch (e) {
    adicionarPasso('Erro no parser', `\\text{${e.message || 'Entrada inválida'}}`);
    console.error(e);
    return;
  }

  try {
    // Fase 2: Transformações sequenciais
    const passos = [
      ['Fórmula original', astParaLatex(ast)],
      ['Eliminar → e ↔ (implicações/equivalências)', astParaLatex(eliminarImplicacoes(ast))],
      ['NNF — Forma Normal Negativa (negações internas)', astParaLatex(paraNNF(eliminarImplicacoes(ast)))],
      ['Renomear variáveis ligadas (alpha-conversion)', astParaLatex(renomearVariaveisLigadas(paraNNF(eliminarImplicacoes(ast))))],
    ];
    
    // Aplicar transformações progressivamente
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

    // Exibe todos os passos de transformação
    passos.forEach(([titulo, latex]) => adicionarPasso(titulo, latex));

    // Fase 3: Análise de cláusulas de Horn
    if (clausulas.length) {
      let analiseHorn = [];
      let todasHorn = true;
      
      clausulas.forEach((clausula, i) => {
        const ehHorn = ehClausulaHorn(clausula);
        const tipo = classificarClausulaHorn(clausula);
        if (!ehHorn) todasHorn = false;
        
        // Mapeia tipos para descrições em português
        let tipoDesc = { fact: 'Fato', rule: 'Regra', goal: 'Goal', 'not-horn': 'Não-Horn' }[tipo];
        analiseHorn.push(`C_{${i + 1}}: (${clausulaParaLatex(clausula)}) \\rightarrow \\text{${tipoDesc}}`);
      });
      
      adicionarPasso('Análise de cláusulas de Horn', analiseHorn.join('\\\\'));
      adicionarPasso('Resumo Horn', 
        todasHorn ? '\\text{Todas as cláusulas são de Horn}' : '\\text{Nem todas as cláusulas são de Horn}');
    } else {
      adicionarPasso('Análise de cláusulas de Horn', '\\text{Nenhuma cláusula encontrada}');
    }

    // Fase 4: DNF para comparação
    adicionarPasso('DNF — Forma Normal Disjuntiva (comparação)', astParaLatex(paraDNF(skolemizado)));
    
  } catch (e) {
    adicionarPasso('Erro durante transformação', `\\text{${e.message || 'Erro inesperado'}}`);
    console.error(e);
  }
  
  // Renderiza todos os novos elementos LaTeX
  MathJax.typesetPromise();
}

/**
 * Inicializa eventos ao carregar a página
 * Configura listeners e estado inicial da interface
 */
document.addEventListener('DOMContentLoaded', function () {
  // Atualiza renderização quando usuário digita
  inputEl.addEventListener('input', atualizarRenderInput);
  // Renderiza estado inicial
  atualizarRenderInput();
});
