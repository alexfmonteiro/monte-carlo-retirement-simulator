# Monte Carlo Retirement Simulator

Um simulador avançado de aposentadoria baseado em simulações de Monte Carlo, implementando as regras de Guyton-Klinger para saques dinâmicos, estratégia de buckets, e modelagem financeira calibrada para investidores brasileiros com portfólios internacionais.

**[Acesse a ferramenta online](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/)**

---

## Índice

- [Aplicativos Disponíveis](#aplicativos-disponíveis)
- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Interface: Modo Simples e Avançado](#interface-modo-simples-e-avançado)
- [Teoria Financeira](#teoria-financeira)
  - [Spending Smile](#spending-smile-curva-de-gastos)
  - [Regime-Switching](#regime-switching-modelo-markov-de-2-estados)
  - [Ajuste por Mortalidade](#ajuste-por-mortalidade)
  - [Backtesting Histórico](#backtesting-histórico)
- [Parâmetros de Entrada](#parâmetros-de-entrada)
- [Calibração dos Defaults](#calibração-dos-defaults)
- [Interpretação dos Resultados](#interpretação-dos-resultados)
- [Instalação e Uso](#instalação-e-uso)
- [Metodologia Técnica](#metodologia-técnica)
- [Referências Acadêmicas](#referências-acadêmicas)

---

## Aplicativos Disponíveis

Este repositório contém dois simuladores complementares:

| Aplicativo | URL | Descrição |
|------------|-----|-----------|
| **SWR Clássico** | [`index.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/) | Simulador principal com Guyton-Klinger, Bucket Strategy, otimizador Die With Zero e análise de stress completa |
| **Yale Endowment** | [`endowment.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/endowment.html) | Comparativo entre três estratégias: Endowment (Yale), SWR Fixo 4% e Guyton-Klinger em uma única tela |

Ambos os aplicativos incluem suporte a benefício INSS, entrada dual BRL/USD e modelagem brasileira completa.

---

## Visão Geral

Este simulador foi desenvolvido para investidores brasileiros que possuem portfólios diversificados internacionalmente (como ETFs irlandeses UCITS) e precisam planejar saques sustentáveis durante a aposentadoria. Oferece dois modos de operação:

- **Modo Preservação**: Você define a taxa de saque e o simulador calcula a probabilidade de sucesso
- **Modo Consumo Máximo** (Die With Zero): Você define a probabilidade de sucesso desejada e o sistema calcula a maior taxa de saque possível

### Problema que Resolve

A clássica "Regra dos 4%" foi desenvolvida para o mercado americano com condições específicas. Para brasileiros, existem fatores adicionais críticos:

- **Risco cambial**: Patrimônio em USD, despesas em BRL
- **Inflação brasileira**: IPCA historicamente mais volátil que CPI
- **Tributação diferenciada**: ETFs irlandeses (15% sob Lei 14.754/2023) vs. Renda Fixa BR (tabela regressiva)
- **Correlação inversa**: Real tende a desvalorizar quando bolsas caem (duplo impacto)

---

## Funcionalidades

### Modelagem Avançada de Retornos

| Funcionalidade | Descrição |
|----------------|-----------|
| **Distribuição T-Student** | Captura "cisnes negros" com caudas mais gordas que a Normal (df=5) |
| **Modos Monte Carlo** | IID puro (padrão) ou NON-IID com limite de sequências negativas |
| **Regime-Switching (Markov)** | Modelo de 2 estados (bull/bear) com probabilidades de transição — captura clustering de volatilidade |
| **Correlação Dinâmica** | Correlação USD/BRL intensifica 2x em crises (base -0.4 → até -0.8) |
| **Modelo IPCA + Juro Real** | RF modelada como IPCA + spread real, evitando juros reais negativos irrealistas |
| **Reprodutibilidade** | Seed opcional para replicar simulações exatas (PRNG Mulberry32) |

### Estratégias de Saque

| Estratégia | Descrição |
|------------|-----------|
| **Guyton-Klinger** | Regras dinâmicas de preservação, prosperidade e inflação (parâmetros originais do paper de 2006) |
| **Bucket Strategy** | Proteção contra sequence of returns risk (5 anos em RF) |
| **Rebalanceamento Inteligente** | Saque de RV quando acima do alvo para rebalancear |
| **Spending Smile (Blanchett)** | Curva de gastos com 3 fases: mais no início (viagens), menos no meio, mais no final (saúde) |
| **Saque Mínimo Garantido** | Nunca sacar menos que o necessário para sobreviver (corrigido pela inflação IPCA) |
| **Benefício INSS** | Renda previdenciária reduz o saque do portfólio a partir da idade elegível; reajustada pelo IPCA simulado |

### Simulador Yale Endowment (`endowment.html`)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Estratégia Endowment** | Fórmula Yale: pondera retorno alvo e valor de mercado anterior para suavizar saques |
| **Comparativo 3 Estratégias** | Exibe lado a lado Endowment, SWR Fixo 4% e Guyton-Klinger na mesma simulação |
| **Tabela de Métricas** | Mediana, média, pior saque, taxa de sucesso e patrimônio final por estratégia, com destaque de melhor/pior |
| **Gráfico de Evolução** | Mediana dos saques anuais para cada estratégia ao longo do horizonte |
| **Fan Chart** | Evolução do portfólio em percentis (P10/P25/P50/P75/P90) por estratégia |

### Otimizador de Consumo Máximo (Die With Zero)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Modo Consumo Máximo** | Calcula automaticamente a maior taxa de saque possível |
| **Bissecção em Duas Fases** | Fase 1 (busca grossa, 200 iter.) + Fase 2 (busca fina, 1000 iter.) + Validação completa |
| **Confiança Parametrizável** | Defina a probabilidade de sucesso desejada (70% a 99%) |
| **Patrimônio Final Alvo** | Defina quanto deseja deixar ao final (R$ 0 = Die With Zero) |

### Análise de Stress

| Análise | O que mede |
|---------|------------|
| **Duração** | Quanto tempo o saque mínimo foi necessário |
| **Tolerância** | Quantos anos de stress você precisa tolerar para X% de sucesso |
| **Impacto no Portfólio** | Quanto a mais foi sacado vs. recomendado |
| **Recuperação** | % dos períodos de stress que eventualmente se recuperam |

### Ajuste por Mortalidade (IBGE)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Tábua de Mortalidade IBGE 2023** | Probabilidades de morte (qx) por idade, idades 0-110, masculino e feminino |
| **Taxa Ajustada por Mortalidade** | Pondera falhas pela probabilidade de já ter falecido — uma falha no ano 48 conta menos que no ano 15 |
| **Perfis: Masculino / Feminino / Casal** | Casal usa probabilidade de sobrevivência conjunta (ao menos um vivo) |
| **Expectativa de Vida** | Mostra expectativa de vida residual com base na idade atual e gênero |

### Backtesting Histórico

| Funcionalidade | Descrição |
|----------------|-----------|
| **Dados 1995-2024** | 30 anos de dados anuais: S&P 500, CDI/Selic, IPCA e câmbio BRL/USD |
| **Janelas Rolantes** | Testa a estratégia em cada ano inicial possível (janelas completas e parciais) |
| **Gráfico Spaghetti** | Todas as janelas sobrepostas — sobreviventes em azul, falhas em vermelho, melhor/pior em destaque |
| **Comparativo Monte Carlo** | Mostra lado a lado a taxa de sucesso histórica vs. simulada |
| **Tabela de Janelas** | Cada ano inicial com status, patrimônio final e pior saque, ordenável por coluna |

### Interface e Usabilidade

| Funcionalidade | Descrição |
|----------------|-----------|
| **Modo Simples / Avançado** | Sidebar com duas abas — modo Simples mostra apenas parâmetros essenciais, modo Avançado mostra tudo |
| **Layout Responsivo** | Layout adaptativo para desktop, tablet e mobile (breakpoint lg: 1024px) |
| **Entrada Dual USD/BRL** | Todos os campos monetários aceitam entrada em USD ou BRL com conversão automática |
| **Tooltips Detalhados** | Clique no ícone (?) para explicações completas de cada parâmetro em português |
| **Exportar Resultados** | Exporta relatório completo em texto com todos os parâmetros, incluindo configurações de INSS |
| **Resumo Calculado** | Exibe em tempo real: alocação RV/RF, saques anuais/mensais, tamanho do bucket |
| **Exibição Mensal** | Cards de saque médio e mediano mostram equivalente mensal para facilitar comparação com renda |

---

## Interface: Modo Simples e Avançado

A sidebar oferece duas abas para controlar a complexidade da interface:

### Modo Simples (padrão)

Mostra apenas os parâmetros essenciais:

- **Objetivo de Vida** — Preservação ou Consumo Máximo
- **Portfólio Inicial** — Patrimônio, câmbio, taxa de retirada
- **Parâmetros de Otimização** — Apenas no modo Consumo
- **Simulação** — Horizonte, iterações, seed

Todos os parâmetros avançados (retornos, volatilidade, Guyton-Klinger, buckets, tributação, etc.) ficam ocultos mas mantêm seus valores padrão calibrados.

### Modo Avançado

Exibe todos os parâmetros, incluindo:

- Retornos Esperados (RV/RF/inflação)
- Estratégia Tenda (glidepath)
- Regras Guyton-Klinger
- Saque Mínimo Necessário
- Estratégia de Buckets
- Curva de Gastos (Spending Smile)
- Ajuste por Mortalidade (IBGE)
- Modelagem Avançada (T-Student, correlação dinâmica, IPCA, tributação, regime-switching)

> **Nota**: Trocar entre os modos não reseta valores. Se você ajustar um parâmetro no modo Avançado e voltar ao Simples, o valor ajustado é mantido.

---

## Teoria Financeira

### Regras de Guyton-Klinger

Desenvolvidas por Jonathan Guyton e William Klinger em 2006, estas regras ajustam dinamicamente os saques baseado nas condições do portfólio:

#### 1. Regra de Preservação do Capital
```
SE taxa_atual > taxa_inicial × (1 + threshold)
ENTÃO reduzir saque em X%
```
**Objetivo**: Proteger o portfólio quando os saques estão consumindo muito do patrimônio.

#### 2. Regra de Prosperidade
```
SENÃO SE taxa_atual < taxa_inicial × (1 - threshold)
ENTÃO aumentar saque em X%
```
**Objetivo**: Permitir melhor qualidade de vida quando o portfólio cresceu significativamente.

> **Nota**: As regras de Preservação e Prosperidade são **mutuamente exclusivas** — apenas uma pode ser aplicada por ano. A Preservação tem prioridade sobre a Prosperidade.

#### 3. Regra de Inflação
```
SE retorno_ano_anterior < 0
ENTÃO não ajustar saque pela inflação
```
**Objetivo**: Preservar capital após anos ruins, aceitando perda temporária de poder de compra.

### Estratégia de Buckets (Reserva)

Baseada no trabalho de Harold Evensky, esta estratégia divide o portfólio em "baldes":

```
┌─────────────────────────────────────────────────┐
│ Anos 1-5: Saques vêm APENAS da Renda Fixa       │
│ ↓                                               │
│ Protege a Renda Variável de vendas forçadas     │
│ durante quedas de mercado                       │
└─────────────────────────────────────────────────┘
```

**Por quê funciona**: O maior risco na aposentadoria é o "Sequence of Returns Risk" — uma sequência de retornos ruins no início pode devastar o portfólio. Mantendo 5+ anos em RF, você nunca precisa vender RV na baixa.

### Rebalanceamento Inteligente por Saque

```
SE alocação_RV > alvo + threshold
ENTÃO sacar da RV (rebalanceia automaticamente)
SENÃO seguir regra de buckets normal
```

**Benefício**: Se o mercado sobe 30% no ano 2, não faz sentido continuar depletando a RF. Sacar da RV aproveita os ganhos E rebalanceia para o alvo.

### Distribuição T-Student vs. Normal

Mercados financeiros exibem "fat tails" — eventos extremos ocorrem mais frequentemente que a distribuição Normal prevê.

| Distribuição | Kurtosis | Eventos -3σ |
|--------------|----------|-------------|
| Normal | 3.0 | 0.13% |
| T-Student (df=5) | 9.0 | 1.24% |
| S&P 500 histórico | ~7.0 | ~0.8% |

Usar T-Student com 5 graus de liberdade captura melhor a probabilidade de crashes como 2008 ou 2020.

> **Nota técnica**: A implementação usa aproximação via razão T = Z/√(χ²/df), com fator de escala √((df-2)/df) para preservar a variância alvo.

### Modos de Monte Carlo (IID vs. NON-IID)

| Modo | Descrição | Implicação Estatística |
|------|-----------|------------------------|
| **IID (padrão)** | Retornos independentes e identicamente distribuídos | Simulação puramente estocástica |
| **NON-IID** | Limita sequências negativas consecutivas | Introduz viés de seleção amostral |

> **Aviso**: O modo NON-IID rejeita caminhos com sequências negativas além do limite, o que pode subestimar riscos de cauda. Use com consciência das implicações.

### Otimizador de Consumo Máximo

Inspirado na filosofia "Die With Zero" de Bill Perkins, este modo inverte a pergunta usual:

```
Modo Preservação: "Quero sacar 4.0% — qual a probabilidade de sucesso?"
Modo Consumo:     "Quero 90% de sucesso — quanto posso sacar?"
```

O otimizador usa **bissecção em duas fases**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Fase 1: Busca Grossa                                           │
│ • Range: 0.5% a 15% SWR                                        │
│ • 200 iterações Monte Carlo por teste                           │
│ • ~5 passos → estreita o intervalo                              │
├─────────────────────────────────────────────────────────────────┤
│ Fase 2: Busca Fina                                              │
│ • Range: resultado ± 1%                                         │
│ • 1000 iterações Monte Carlo por teste                          │
│ • ~4 passos → encontra taxa ótima                               │
├─────────────────────────────────────────────────────────────────┤
│ Validação Final                                                 │
│ • Executa simulação completa (2000+ iterações)                  │
│ • Confirma resultado com máxima precisão                        │
└─────────────────────────────────────────────────────────────────┘
```

> **Nota**: O otimizador reutiliza TODOS os parâmetros configurados (G-K, Buckets, Tenda, T-Student, correlação dinâmica, impostos). Ele apenas busca a `withdrawalRate` ideal — não altera nenhuma regra de simulação.

### Estratégia Yale Endowment

A fórmula Yale (desenvolvida por David Swensen para o endowment da Universidade Yale) suaviza os saques ao ponderar dois componentes:

```
Saque_ano_t = α × (Saque_ano_(t-1) × (1 + Inflação)) + (1 - α) × (Taxa_alvo × Portfólio_ano_(t-1))
```

- **α (peso de suavização)**: Quanto do saque anterior influencia o atual (típico: 0.7)
- **Taxa alvo**: Percentual anual do portfólio a sacar (típico: 4-5%)
- **Efeito**: Suaviza a volatilidade dos saques — anos bons não geram aumentos abruptos, e anos ruins não forçam cortes drásticos

O simulador compara a estratégia Endowment com SWR Fixo 4% e Guyton-Klinger na mesma tela, permitindo avaliar o trade-off entre estabilidade de renda (Endowment), simplicidade (SWR Fixo) e flexibilidade adaptativa (G-K).

### Spending Smile (Curva de Gastos)

Pesquisa de David Blanchett (2014) demonstrou que os gastos reais durante a aposentadoria não são constantes — seguem uma curva em forma de "U" (smile):

```
Gasto
  ▲
  │  ╲               ╱
  │   ╲             ╱
  │    ╲           ╱
  │     ╲─────────╱
  │
  └──────────────────────▶ Anos
    Início    Meio     Final
    (120%)   (85%)    (110%)
```

- **Início (primeiro terço)**: Gastos elevados com viagens, lazer ativo, reformas
- **Meio (segundo terço)**: Estabilização — rotina, menos viagens
- **Final (terceiro terço)**: Custos crescentes com saúde, cuidadores, medicamentos

O multiplicador é aplicado **após** as regras de Guyton-Klinger, de modo que os gatilhos de preservação e prosperidade continuam avaliando a taxa de saque sustentável. A transição entre fases usa interpolação por cosseno para evitar descontinuidades.

### Regime-Switching (Modelo Markov de 2 Estados)

Mercados financeiros exibem "clustering de volatilidade" — períodos de alta tendem a durar vários anos, assim como períodos de baixa. O modelo IID padrão não captura esse comportamento.

```
┌─────────┐  P=0.875  ┌─────────┐
│  BULL   │──────────→│  BULL   │
│ μ=12%   │           │         │
│ σ=12%   │←──────────│         │
└────┬────┘  P=0.50   └─────────┘
     │ P=0.125              ▲ P=0.50
     ▼                      │
┌─────────┐           ┌─────────┐
│  BEAR   │──────────→│  BEAR   │
│ μ=-5%   │           │         │
│ σ=25%   │←──────────│         │
└─────────┘  P=0.875  └─────────┘
```

**Distribuição estacionária**: ~80% do tempo em bull, ~20% em bear. O retorno esperado ponderado (~8.6%) é consistente com médias históricas.

### Ajuste por Mortalidade

A taxa de sobrevivência bruta trata todas as falhas igualmente — uma falha no ano 48 tem o mesmo peso que uma no ano 15. Mas um aposentado de 60 anos tem probabilidade muito menor de chegar aos 108 do que aos 75.

```
Peso da falha = P(vivo no ano da falha)

Exemplo (homem, início aos 60 anos):
  Falha no ano 15 (idade 75): P(vivo) ≈ 74% → conta quase integralmente
  Falha no ano 30 (idade 90): P(vivo) ≈ 25% → conta com 25% do peso
  Falha no ano 48 (idade 108): P(vivo) ≈ 0.1% → praticamente irrelevante
```

O modo "Casal" usa: P(ao menos um vivo) = 1 - (1 - P_masculino) × (1 - P_feminino).

### Backtesting Histórico

Enquanto o Monte Carlo gera cenários aleatórios, o backtesting histórico responde: **"como minha estratégia teria performado em cada período real da história?"**

```
Dados: 1995-2024 (30 anos pós-Plano Real)

Janela 1: 1995-2024 (30 anos, completa para horizonte ≤30)
Janela 2: 1996-2024 (29 anos)
Janela 3: 1997-2024 (28 anos)
...
Janela 26: 2020-2024 (5 anos, mínimo)
```

Para cada janela, aplica a mesma estratégia (G-K, buckets, impostos, smile, mínimo) usando retornos reais de S&P 500, CDI/Selic, IPCA e BRL/USD. O resultado inclui:
- Taxa de sobrevivência entre janelas completas
- Gráfico spaghetti (todas as trajetórias sobrepostas)
- Melhor e pior ano de início
- Comparação direta com o resultado Monte Carlo

> **Limitação**: Com 30 anos de dados pós-Real, horizontes acima de 30 anos terão apenas janelas parciais. Os dados não cobrem cenários extremos como hiperinflação pré-Real.

### Correlação Dinâmica BRL/USD

Em condições normais, a correlação entre retornos de RV e câmbio é aproximadamente -0.4 (quando bolsa cai, dólar sobe). Mas em crises extremas:

```
Condição Normal:   ρ = -0.40
Crise Moderada:    ρ = -0.60
Crise Severa:      ρ = -0.80
```

O simulador modela isso dinamicamente baseado na severidade da queda.

---

## Parâmetros de Entrada

### Objetivo de Vida

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Modo** | Preservação (você define SWR) ou Consumo Máximo (sistema calcula SWR) | Preservação |
| **Confiança Desejada** | Probabilidade mínima de sucesso (apenas modo Consumo) | 90% |
| **Patrimônio Final Alvo** | Quanto deixar ao final do horizonte (apenas modo Consumo) | R$ 0 |
| **Tolerância da Busca** | Precisão do otimizador (apenas modo Consumo) | 0.1% |

### Portfólio Inicial

| Parâmetro | Descrição | Default | Valores Típicos |
|-----------|-----------|---------|-----------------|
| **Patrimônio Total** | Valor total do portfólio (entrada em USD ou BRL) | $1,000,000 | $500k - $2M |
| **Taxa de Câmbio** | USD/BRL inicial | 5.80 | 5.00 - 6.50 |
| **Taxa de Retirada (SWR)** | % anual do portfólio inicial (modo Preservação) | 4.0% | 3.0% - 5.0% |

> **Nota**: O portfólio total é dividido entre RV e RF conforme o "% RF Inicial" definido na Estratégia Tenda. Todos os campos monetários possuem entrada dual USD/BRL com conversão automática.

### Retornos e Volatilidade

| Parâmetro | Descrição | Default | Base Empírica |
|-----------|-----------|---------|---------------|
| **Retorno RV** | Retorno nominal esperado em USD (RV global) | 7.0% | S&P 500: ~10% nominal, MSCI World: ~8.9% |
| **Volatilidade RV** | Desvio padrão anual | 18.0% | S&P 500: ~19%, MSCI ACWI: ~15.7% |
| **Retorno RF** | Retorno da renda fixa (se não usar modelo IPCA) | 4.0% | NTN-B real: ~4-5% |
| **Volatilidade RF** | Desvio padrão RF | 6.0% | NTN-B: ~5-12% conforme prazo |
| **Inflação (IPCA)** | Inflação anual esperada | 4.5% | IPCA 2004-2024: ~5.7% média |

### Horizonte e Simulação

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Anos** | Horizonte de aposentadoria | 30 |
| **Iterações** | Número de simulações Monte Carlo | 2000 |
| **Modo** | IID (padrão) ou NON-IID | IID |
| **Seed** | Semente para reprodutibilidade (vazio = aleatório) | - |

> **Reprodutibilidade**: Ao definir um seed, a mesma simulação pode ser replicada exatamente. Útil para comparações e validação.

### Estratégia Tenda (Bond Glide Path)

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **RF Inicial** | % em renda fixa no início | 35% |
| **Duração Transição** | Anos para atingir a alocação alvo | 5 |
| **RF Alvo** | % em renda fixa após transição | 20% |

A implementação é um **glide path linear** — a alocação de RF decresce linearmente do valor inicial até o alvo durante o período de transição. Academicamente, esta é uma estratégia de "rising equity glide path" (Kitces & Pfau, 2015).

### Regras de Guyton-Klinger

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Gatilho Preservação** | % acima da taxa inicial para cortar | 20% |
| **Gatilho Prosperidade** | % abaixo da taxa inicial para aumentar | 20% |
| **Ajuste** | % de ajuste quando regra dispara | 10% |
| **Aplicar Regra de Inflação** | Pular inflação após anos ruins | Sim |

> Os parâmetros 20%/20%/10% são idênticos aos do paper original de Guyton & Klinger (2006).

### Bucket Strategy

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Buckets** | Ativar estratégia de reserva | Sim |
| **Anos de Proteção** | Anos sacando exclusivamente da RF | 5 |

### Saque Mínimo

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Mínimo** | Ativar saque mínimo garantido | Não |
| **Valor Mínimo** | Saque mínimo anual em BRL (valores de hoje) | R$ 200.000 |

> **Importante**: O saque NUNCA será menor que o mínimo definido (corrigido pela inflação IPCA), mesmo que isso acelere a depleção do portfólio. O valor informado representa o poder de compra atual — ao longo da simulação, o piso cresce com a inflação simulada. Com INSS ativo, o mínimo se aplica ao saque do portfólio após o abatimento da renda previdenciária.

### Curva de Gastos (Spending Smile)

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Spending Smile** | Ativar curva de gastos por fase da aposentadoria | Não |
| **Multiplicador Início** | Fator para o primeiro terço (viagens, lazer) | 1.20 (120%) |
| **Multiplicador Meio** | Fator para o terço intermediário (vida estável) | 0.85 (85%) |
| **Multiplicador Final** | Fator para o terço final (saúde, cuidados) | 1.10 (110%) |

> **Baseado em**: Blanchett (2014) — "Estimating the True Cost of Retirement". Pesquisa mostra que gastos reais em aposentadoria seguem uma curva em "U" (smile): mais altos no início (viagens e lazer ativo), menores no meio (vida estável), e subindo novamente no final (custos de saúde). O multiplicador é aplicado após as regras de Guyton-Klinger, ajustando o gasto efetivo sem afetar os gatilhos de preservação/prosperidade.

### Benefício INSS

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Receber Benefício INSS** | Ativar modelagem de renda previdenciária | Não |
| **Idade Atual (Aposentadoria)** | Sua idade no ano 1 da simulação | 60 anos |
| **Idade de Início do INSS** | Idade de elegibilidade ao benefício | 65 anos |
| **Benefício Mensal INSS** | Valor mensal bruto em BRL | R$ 3.000 |

> **Como funciona**: O benefício mensal é convertido para anual e abatido do saque necessário do portfólio. O valor é corrigido pelo IPCA simulado a cada ano — se o IPCA acumulado cresce, o benefício em BRL cresce na mesma proporção. O INSS é tributado na fonte e não afeta o cálculo de impostos sobre o portfólio.
>
> **Regras de elegibilidade (2024)**: 65 anos para homens com 20 anos de contribuição; 62 anos para mulheres com 15 anos de contribuição.
>
> **Impacto nos saques**: Enquanto o INSS não estiver ativo (antes da idade de elegibilidade), os saques do portfólio são normais. Após o início, o portfólio financia apenas a diferença entre o gasto total e a renda INSS. Se o INSS cobre integralmente o mínimo necessário, nenhum mínimo é aplicado ao portfólio (a renda total ainda atinge o piso).
>
> **Métricas de renda total**: As métricas de saque (pior saque, média, mediana, saques por período) refletem a renda total recebida — saque do portfólio + renda INSS — para representar o padrão de vida real.

### Modelagem Avançada

| Parâmetro | Descrição | Default | Base Empírica |
|-----------|-----------|---------|---------------|
| **T-Student** | Usar distribuição com caudas gordas | Sim | - |
| **Graus de Liberdade** | Menor = caudas mais gordas | 5 | Pesquisas sugerem df=2-7 para mercados |
| **Correlação Dinâmica** | Correlação FX intensifica em crises | Sim | - |
| **Correlação Base** | Correlação RV vs. BRL/USD | -0.4 | USD/S&P 500: ~-0.26 média, BRL mais forte |
| **Multiplicador Stress** | Intensificação em crises | 2.0x | Crises: correlação chega a -0.8 |
| **Modelo IPCA** | RF = IPCA + Juro Real | Sim | - |
| **IPCA Esperado** | IPCA médio esperado | 4.5% | IPCA 2004-2024: ~5.7% média |
| **Volatilidade IPCA** | Desvio padrão do IPCA | 2.0% | Histórico: ~1.8-2.0% |
| **Spread Real** | Juro real sobre IPCA (NTN-B) | 5.0% | NTN-B histórico: ~3.6-5.0% média |
| **Modelo Tributário** | Descontar IR dos saques | Sim | - |
| **IR RV** | Alíquota sobre ganhos de RV | 15% | Lei 14.754/2023 (investimentos offshore) |
| **IR RF** | Alíquota sobre rendimentos RF | 15% | Tabela regressiva IR (>720 dias) |

### Regime-Switching (Modelo Markov)

| Parâmetro | Descrição | Default | Base Empírica |
|-----------|-----------|---------|---------------|
| **Usar Regime-Switching** | Substituir retornos IID por modelo de 2 estados | Não | - |
| **Retorno Bull** | Retorno médio no regime de alta | 12.0% | Mercados em expansão |
| **Volatilidade Bull** | Volatilidade no regime de alta | 12.0% | Vol menor em bull markets |
| **Retorno Bear** | Retorno médio no regime de baixa | -5.0% | Mercados em contração |
| **Volatilidade Bear** | Volatilidade no regime de baixa | 25.0% | Vol elevada em bear markets |
| **P(Bull→Bull)** | Probabilidade de permanecer em bull | 0.875 | Duração média ~8 anos |
| **P(Bear→Bear)** | Probabilidade de permanecer em bear | 0.50 | Duração média ~2 anos |

> **Baseado em**: Hamilton (1989), Ang & Bekaert (2002). Quando ativado, substitui os parâmetros de retorno/volatilidade de RV por dois regimes com probabilidades de transição. A distribuição estacionária resulta em ~80% bull / ~20% bear. O retorno esperado ponderado é ~8.6%, próximo da média histórica do S&P 500.

### Ajuste por Mortalidade

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Ajuste por Mortalidade** | Ponderar taxa de sucesso pela probabilidade de sobrevivência | Não |
| **Perfil** | Masculino, Feminino ou Casal | Masculino |

> **Fonte**: IBGE Tábua Completa de Mortalidade 2023. Para o modo "Casal", usa probabilidade de sobrevivência conjunta: P(ao menos um vivo) = 1 - P(ambos falecidos). A taxa ajustada é sempre ≥ a taxa bruta, pois desconta falhas que ocorreriam após o falecimento provável.

### Backtesting Histórico

Não requer parâmetros adicionais — usa os mesmos parâmetros do Monte Carlo (portfólio, SWR, G-K, buckets, impostos, etc.), mas aplica retornos históricos reais em vez de simulados. Ativado via aba "Backtesting Histórico" no painel de resultados.

| Dados | Período | Fonte |
|-------|---------|-------|
| **S&P 500 Total Return** | 1995-2024 | Retorno nominal anual em USD |
| **CDI/Selic** | 1995-2024 | Retorno nominal anual (proxy RF brasileira) |
| **IPCA** | 1995-2024 | Inflação anual oficial |
| **BRL/USD** | 1995-2024 | Taxa de câmbio fim de ano |

---

## Calibração dos Defaults

Todos os valores padrão foram calibrados com base em dados históricos e pesquisa acadêmica:

### Retorno RV: 7.0% (nominal USD)

O retorno de 7% é uma estimativa **conservadora** para retornos nominais em USD de um portfólio global de renda variável. O S&P 500 retornou ~10% nominal historicamente (1928-2024), e o MSCI World ~8.9%. O valor de 7% já embute desconto para: diversificação não-US, drag de ETFs irlandeses (~0.3% de WHT + TER), e incerteza sobre retornos futuros.

### Taxa de Retirada: 4.0%

A clássica regra de Bengen (1994) de 4% foi baseada em dados americanos. Pesquisas internacionais (Pfau, 2010) mostram que a SWR segura global é ~3.5% para portfólios 50/50. Com as regras Guyton-Klinger ativadas (que permitem flexibilidade de gastos), taxas de até ~4.5% podem ser viáveis. O default de 4.0% equilibra segurança e aproveitamento com G-K ativo.

### Spread Real RF: 5.0% (sobre IPCA)

O Tesouro IPCA+ (NTN-B) historicamente pagou uma média de ~3.6-5.0% de juro real. Em fevereiro de 2026, as taxas estão elevadas (~7.5%), mas para um horizonte de 30 anos é prudente assumir normalização. O default de 5.0% reflete um cenário moderadamente otimista mas alcançável.

### IPCA: 4.5%

O IPCA médio de 2004-2024 foi ~5.7%, mas o período inclui choques inflacionários (2015-2016, 2021-2022). A meta do Banco Central é 3.0% (+/- 1.5pp). O default de 4.5% reflete a tendência brasileira de operar acima da meta, sem assumir os extremos.

### Correlação BRL/USD: -0.4

A correlação média USD/S&P 500 é ~-0.26, mas para moedas de mercados emergentes como o BRL (que têm forte caráter risk-on/risk-off), a correlação negativa é mais intensa. Com multiplicador de stress 2.0x, a correlação pode chegar a -0.8 durante crises, consistente com o observado em 2008, 2015 e 2020.

### Tributação: 15%

A Lei 14.754/2023 estabeleceu alíquota flat de 15% sobre rendimentos de investimentos offshore para residentes fiscais brasileiros (vigente desde janeiro de 2024). Para renda fixa brasileira, 15% corresponde à alíquota mínima da tabela regressiva (aplicações >720 dias), que é o cenário típico de um portfólio de aposentadoria.

### Guyton-Klinger: 20%/20%/10%

Os parâmetros são idênticos aos do paper original de Guyton & Klinger (2006): gatilho de preservação a 20% acima da taxa inicial, prosperidade a 20% abaixo, e ajuste de 10% quando a regra dispara.

---

## Interpretação dos Resultados

### Card: Plano de Consumo Máximo (Modo Consumo)

Exibido apenas no modo Consumo Máximo:

```
Taxa Ótima: 5.23% (±0.1%)
Saque Mensal: R$ 24.000
Saque Anual: R$ 288.000
Sobrevivência Real: 90.5%
Patrimônio Final Mediano: R$ 125.000
```

- **Taxa Ótima**: A maior taxa de saque inicial onde a sobrevivência >= confiança desejada
- **±0.1%**: Margem de precisão da busca (configurável via "Tolerância")
- **Sobrevivência Real**: Taxa efetiva calculada na validação final
- **Patrimônio Final Mediano**: Metade dos cenários bem-sucedidos termina acima deste valor

### Card: Taxa de Sobrevivência

| Taxa | Interpretação |
|------|---------------|
| > 95% | Excelente - estratégia muito robusta |
| 90-95% | Bom - risco aceitável para maioria |
| 80-90% | Atenção - considere ajustes |
| < 80% | Risco elevado - revise parâmetros |

Quando o ajuste por mortalidade está ativo, o card mostra duas taxas:
- **Taxa ajustada** (destaque): Pondera falhas pela probabilidade de estar vivo. Sempre ≥ taxa bruta.
- **Taxa bruta** (subtítulo): A taxa tradicional sem ponderação por mortalidade.

### Gráfico: Evolução do Portfólio

Mostra bandas de percentis ao longo do tempo:
- **P90** (linha superior): 10% melhores cenários
- **P75**: Quartil superior
- **P50** (mediana): Cenário central
- **P25**: Quartil inferior
- **P10** (linha inferior): 10% piores cenários

### Gráfico: Evolução dos Saques (index.html)

Exibe a evolução dos saques médios ao longo dos anos com as seguintes séries:
- **Saque Médio** (azul sólido): Média dos saques anuais do portfólio em todos os cenários
- **Saque Mediano** (azul tracejado): Mediana dos saques, menos sensível a outliers
- **Saque Mínimo** (vermelho): Linha de referência do mínimo configurado (se ativo)
- **Renda INSS** (âmbar tracejado): Média da renda INSS ao longo dos anos, iniciando no ano de elegibilidade (exibida apenas quando INSS está ativo)

### Cards: Saque Médio e Mediano

Os cards de saque exibem o valor anual em destaque e o **equivalente mensal** em subtítulo (`~R$ Xk/mês`), facilitando a comparação com renda mensal e custos de vida.

### Seção: Análise de Stress

- **Duração dos Períodos de Stress**: Quanto tempo consecutivo o saque mínimo foi necessário
- **Taxa de Tolerância vs. Sucesso**: "Se eu posso tolerar X anos de stress, qual minha taxa de sucesso?"
- **Impacto no Portfólio**: Quanto a mais foi retirado vs. G-K recomendado
- **Taxa de Recuperação**: % dos períodos de stress que eventualmente se recuperaram

### Aba: Backtesting Histórico

Acessível via toggle "Monte Carlo | Backtesting Histórico" no topo dos resultados (requer execução do Monte Carlo primeiro):

- **Visão Geral**: Cards com taxa de sobrevivência histórica, janelas testadas, saque mediano/pior, comparação com Monte Carlo
- **Gráfico Spaghetti**: Todas as trajetórias históricas sobrepostas — falhas em vermelho, melhor/pior em destaque
- **Gráfico de Percentis**: Bandas P10-P90 do portfólio ao longo do tempo (derivadas das janelas históricas)
- **Evolução dos Saques**: Média e mediana dos saques por ano entre todas as janelas
- **Tabela de Janelas**: Cada ano inicial com status, duração, patrimônio final e pior saque

---

## Instalação e Uso

### Uso Online (Recomendado)

- **SWR Clássico**: **https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/**
- **Yale Endowment**: **https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/endowment.html**

A interface é responsiva e funciona em desktop, tablet e celular.

### Uso Local

```bash
# Clone o repositório
git clone https://github.com/alexfmonteiro/monte-carlo-retirement-simulator.git

# Entre na pasta
cd monte-carlo-retirement-simulator

# Abra no navegador
open index.html          # SWR Clássico
open endowment.html      # Yale Endowment Comparativo
# ou
python -m http.server 8000
# e acesse http://localhost:8000 (SWR) ou http://localhost:8000/endowment.html (Yale)
```

### Executando os Testes

O projeto inclui uma suíte de testes completa que valida toda a lógica de simulação:

```bash
# Abra tests.html no navegador
open tests.html
# ou via servidor local
python -m http.server 8000
# e acesse http://localhost:8000/tests.html
```

A suíte de testes cobre:
- Distribuições estatísticas (Box-Muller, T-Student, Cholesky)
- Regras de Guyton-Klinger (Preservação, Prosperidade, Inflação)
- Exclusividade mútua das regras G-K
- Cálculos de impostos
- Modelo IPCA
- Correlação dinâmica FX
- Simulação de câmbio
- Reprodutibilidade com seed (PRNG determinístico)
- Casos extremos
- Testes de regressão E2E (cenários seeded determinísticos)
- Otimizador de consumo máximo (bissecção, convergência, limites)

### Hospedagem no GitHub Pages

1. Faça fork deste repositório
2. Vá em Settings > Pages
3. Selecione "main" branch e "/" (root)
4. Aguarde alguns minutos
5. Acesse `https://seu-usuario.github.io/monte-carlo-retirement-simulator/`

---

## Metodologia Técnica

### Geração de Números Aleatórios

**PRNG Seedável (Mulberry32)**:

```javascript
// Algoritmo Mulberry32 - rápido, simples, período 2³²
state = (state + 0x6D2B79F5) >>> 0
// ... operações de mixing para distribuição uniforme
```

**Box-Muller Transform** para distribuição Normal:

```javascript
Z = √(-2 ln U₁) × cos(2π U₂)
```

**T-Student** via razão (aproximação):

```javascript
T = Z / √(χ²/df) × scaleFactor
// scaleFactor = √((df-2)/df) para preservar variância
```

### Correlação

Decomposição de Cholesky para gerar variáveis correlacionadas:

```javascript
Z₂_correlacionado = ρ × Z₁ + √(1-ρ²) × Z₂
```

### Simulação de Câmbio

Modelo com:

1. **Correlação com equity**: Quando RV cai, USD sobe (Cholesky)
2. **Mean reversion**: Câmbio tende a voltar à média de longo prazo
3. **Stress multiplier**: Volatilidade aumenta 1.3x em crises

### Cálculo de Impostos

```javascript
Imposto = Saque × Proporção_Ganhos × Alíquota
```

Onde Proporção_Ganhos cresce com o tempo (mais do portfólio é ganho, menos é principal).

### Otimizador (Método da Bissecção)

```javascript
low = 0.5%, high = 15%
while (high - low > tolerance):
    mid = (low + high) / 2
    result = runMonteCarlo(mid, iterations)
    if result.survivalRate >= target:
        best = mid      // Pode tentar taxa mais alta
        low = mid
    else:
        high = mid      // Precisa taxa mais baixa
```

A abordagem em duas fases reduz o número total de simulações:

- **Fase 1**: ~5 passos × 200 iterações = 1,000 simulações
- **Fase 2**: ~4 passos × 1,000 iterações = 4,000 simulações
- **Validação**: 1 × N iterações (configurável)
- **Total**: ~5,000 + N simulações

> **Seed consistente**: O otimizador usa o mesmo seed mestre em todos os passos da bissecção, garantindo comparações justas entre taxas.

---

## Referências Acadêmicas

1. **Bengen, W. P. (1994)**. "Determining Withdrawal Rates Using Historical Data." *Journal of Financial Planning*.

2. **Guyton, J. T., & Klinger, W. J. (2006)**. "Decision Rules and Maximum Initial Withdrawal Rates." *Journal of Financial Planning*.

3. **Pfau, W. D. (2010)**. "An International Perspective on Safe Withdrawal Rates from Retirement Savings." *Journal of Financial Planning*.

4. **Kitces, M. E., & Pfau, W. D. (2015)**. "Retirement Risk, Rising Equity Glide Paths, and Valuation-Based Asset Allocation." *Journal of Financial Planning*.

5. **Estrada, J. (2017)**. "Maximum Withdrawal Rates: An Empirical and Global Perspective." *Journal of Retirement*.

6. **Pfau, W. D. (2018)**. *How Much Can I Spend in Retirement?* Retirement Researcher Media.

7. **Perkins, B. (2020)**. *Die With Zero: Getting All You Can from Your Money and Your Life*. Houghton Mifflin Harcourt.

8. **Brasil, Lei 14.754/2023**. Tributação de investimentos no exterior para residentes fiscais brasileiros. Alíquota de 15% sobre rendimentos offshore.

9. **Blanchett, D. (2014)**. "Estimating the True Cost of Retirement." *Morningstar Investment Management*. Demonstra que gastos reais em aposentadoria seguem uma curva em "U" (spending smile).

10. **Hamilton, J. D. (1989)**. "A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle." *Econometrica*. Introduz modelos de regime-switching para séries temporais econômicas.

11. **Ang, A., & Bekaert, G. (2002)**. "Regime Switches in Interest Rates." *Journal of Business & Economic Statistics*. Aplica modelos Markov de regime-switching a retornos financeiros.

12. **IBGE (2023)**. "Tábuas Completas de Mortalidade — Brasil." *Instituto Brasileiro de Geografia e Estatística*. Dados de mortalidade por idade e gênero usados no ajuste atuarial.

---

## Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.

---

## Contribuições

Contribuições são bem-vindas! Por favor, abra uma issue primeiro para discutir mudanças significativas.

---

## Disclaimer

Esta ferramenta é apenas para fins educacionais e de planejamento. Não constitui aconselhamento financeiro. Consulte um profissional certificado antes de tomar decisões de investimento.

---

Desenvolvido para a comunidade FIRE brasileira.
