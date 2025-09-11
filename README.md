# Desafio-Formula-Logica

Uma aplicação web acadêmica para manipulação e transformação de fórmulas da **Lógica de Primeira Ordem** (FOL), desenvolvida em HTML, CSS e JavaScript puro.

## Funcionalidades

- **Entrada em LaTeX:** Digite fórmulas de lógica de primeira ordem usando notação LaTeX.
- **Barra de símbolos:** Insira rapidamente símbolos lógicos (∀, ∃, ¬, ∧, ∨, →, ↔, parênteses).
- **Exemplos rápidos:** Clique em exemplos prontos para testar a ferramenta.
- **Renderização matemática:** Visualize fórmulas renderizadas com MathJax.
- **Transformações passo a passo:**
  - Exibir fórmula original
  - Eliminar implicações (→) e equivalências (↔)
  - Converter para Forma Normal Negativa (NNF)
  - Renomear variáveis ligadas (alpha-conversion)
  - Converter para Forma Prenex (quantificadores na frente)
  - Skolemização (eliminação de ∃)
  - Converter para Forma Normal Conjuntiva (CNF)
  - Extrair forma cláusal (conjunto de cláusulas)
  - Analisar cláusulas de Horn
  - Converter para Forma Normal Disjuntiva (DNF)

## Como usar

Acesse diretamente pelo navegador:

[https://mateusmonfort.github.io/Desafio-Formula-Logica/](https://mateusmonfort.github.io/Desafio-Formula-Logica/)

1. **Digite ou selecione uma fórmula lógica.**
2. **Clique em "Processar" para ver as transformações.**
3. **Veja o passo a passo das formas normais e análise de Horn.**

## Exemplos de entrada

- `\forall x (P(x) \rightarrow Q(x))`
- `\exists x (P(x) \land \forall y (Q(y) \rightarrow R(x,y)))`
- `\forall x \exists y \forall z (P(x,y) \rightarrow Q(z))`
- `(P \leftrightarrow Q)`
- `(A \rightarrow (B \land C))`
- `\forall x (P(x) \rightarrow (Q(x) \lor R(x)))`
- `\neg \forall x (P(x) \land Q(x))`
- `\exists z (R(z) \land \forall w (S(w,z)))`

## Símbolos suportados

- **Quantificadores:** `\forall x`, `\exists y`, etc.
- **Operadores lógicos:** `\neg`, `\land`, `\lor`, `\rightarrow`, `\leftrightarrow`
- **Predicados:** `P(x)`, `Q(x,y)`, `R(x,y,z)`, `S`
- **Variáveis:** qualquer letra (a-z, A-Z)
- **Parênteses:** para agrupamento

## Estrutura do projeto

```
site/
├── index.html
├── js/
│   └── script.js
├── css/
│   └── styles.css
```

## Tecnologias

- HTML5
- CSS3
- JavaScript (sem bibliotecas externas, exceto MathJax para renderização)

## Licença

Este projeto é apenas para fins acadêmicos.

---

Desenvolvido para o desafio de Programação Lógica e Funcional
