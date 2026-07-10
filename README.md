# Monte Carlo Retirement Simulator

Simulador de aposentadoria para brasileiros com patrimônio dolarizado. Você gasta em reais, investe em dólares, paga IPCA e imposto brasileiro — a Regra dos 4% não foi feita para você. Esta ferramenta simula milhares de cenários de mercado (com câmbio, inflação brasileira e tributação reais) e responde às perguntas que importam: posso parar de trabalhar hoje? Quanto posso gastar? Quanto tempo mais preciso trabalhar?

**[Acesse a ferramenta online](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/)**

---

## As quatro perguntas que a ferramenta responde

Cada pergunta tem um caminho direto na interface. Comece por aqui.

### 1. "Se eu parar de trabalhar hoje, o dinheiro dura?"

Preencha patrimônio, gasto-alvo (na seção **Fase de Acumulação**, modo "Gasto Alvo") e idade. Rode a simulação e abra a aba **Projeção**: o card **"Se parar hoje"** mostra sua probabilidade de sobrevivência gastando o que você realmente gasta, sem trabalhar nenhum dia a mais. Aparecem duas taxas. A bruta exige que o portfólio dure até os 100 anos. A ajustada por mortalidade responde outra pergunta, geralmente mais útil: qual a chance de *você* presenciar a falência do plano, descontando a probabilidade de já ter falecido quando ela ocorreria.

### 2. "Quanto tempo mais preciso trabalhar?"

Na mesma aba **Projeção**, informe seu aporte mensal. A ferramenta varre 0 a 10 anos extras de trabalho e traça o gasto mensal sustentável por idade de aposentadoria, com uma linha de referência no seu gasto-alvo. Onde a curva cruza a linha é a sua idade mínima de aposentadoria confortável. A tabela abaixo do gráfico detalha cada idade: patrimônio projetado, SWR sustentável e sobrevivência no seu gasto real.

### 3. "Quanto posso gastar por mês com X% de confiança?"

Troque o Objetivo de Vida para **Consumo Máximo**, defina a confiança (ex.: 90%) e, se quiser deixar herança, o patrimônio final alvo (R$ 0 = Die With Zero). O otimizador bissecciona a maior taxa de saque que atende os dois critérios e devolve o valor em R$/mês.

### 4. "Como minha estratégia teria se saído na crise de 2000? E em 2008?"

Rode o Monte Carlo e abra a aba **Backtesting Histórico**. A mesma estratégia (com todas as suas regras e impostos) é testada contra os dados reais de 1995-2024: S&P 500, CDI, IPCA e câmbio. O gráfico spaghetti mostra cada ponto de partida histórico — quem sobreviveu, quem quebrou e quando.

---

## Aplicativos e abas

| Onde | O que faz |
|------|-----------|
| [`index.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/) — aba **Monte Carlo** | Simulação estocástica principal: Guyton-Klinger, buckets, stress, otimizador |
| [`index.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/) — aba **Backtesting Histórico** | Mesma estratégia contra os dados reais de 1995-2024, em janelas rolantes |
| [`index.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/) — aba **Projeção** | Fase de acumulação: "se parar hoje" + curva de gasto sustentável por idade |
| [`endowment.html`](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/endowment.html) | Comparativo lado a lado: estratégia Yale Endowment vs. SWR fixo vs. Guyton-Klinger |

As abas Backtesting e Projeção aparecem no topo dos resultados após a primeira execução do Monte Carlo.

---

## Índice

- [Por que não usar a Regra dos 4%](#por-que-não-usar-a-regra-dos-4)
- [Funcionalidades](#funcionalidades)
- [Interface: Modo Simples e Avançado](#interface-modo-simples-e-avançado)
- [Teoria Financeira](#teoria-financeira)
- [Parâmetros de Entrada](#parâmetros-de-entrada)
- [Calibração dos Defaults](#calibração-dos-defaults)
- [Interpretação dos Resultados](#interpretação-dos-resultados)
- [Instalação e Uso](#instalação-e-uso)
- [Metodologia Técnica](#metodologia-técnica)
- [Referências Acadêmicas](#referências-acadêmicas)

---

## Por que não usar a Regra dos 4%

A regra de Bengen (1994) assume um americano que investe em dólar e gasta em dólar. Um brasileiro com ETFs irlandeses tem quatro problemas que ela ignora:

- **Risco cambial**: patrimônio em USD, contas em BRL. O câmbio pode trabalhar contra você por uma década inteira.
- **Inflação brasileira**: seus gastos crescem pelo IPCA, não pelo CPI. A diferença composta ao longo de 30 anos é enorme.
- **Tributação própria**: 15% flat sobre ganhos offshore (Lei 14.754/2023), tabela regressiva na renda fixa local.
- **Correlação perversa**: quando a bolsa americana cai, o real costuma cair junto — o que amortece a queda em BRL, mas só se o modelo capturar isso. Aqui, o choque cambial é correlacionado com o retorno de RV efetivamente sorteado no ano (correlação realizada ≈ parâmetro configurado), não com um sorteio descartado.

O simulador trata o patrimônio como duas carteiras ("sleeves"): a USD (RV global + bonds americanos, com risco cambial) e a BRL (renda fixa IPCA+, sem risco cambial). O gasto é denominado em reais e corrigido pelo IPCA simulado; os saques drenam primeiro a sleeve BRL (hedge natural) e o plano só falha quando as duas zeram.

---

## Funcionalidades

### Modelagem de retornos

| Funcionalidade | Descrição |
|----------------|-----------|
| **Distribuição T-Student** | Caudas mais gordas que a Normal para capturar crashes (df=8 para retornos anuais) |
| **Regime-Switching (Markov)** | 2 estados (bull/bear) com probabilidades de transição — captura clustering de volatilidade |
| **Correlação Dinâmica FX** | Correlação RV/câmbio base -0.35 intensifica até -0.8 em crises |
| **Modelo IPCA + Juro Real** | RF brasileira = IPCA simulado + spread real, evitando juros reais negativos irrealistas |
| **Âncora PPP no câmbio** | O câmbio reverte ao valor inicial corrigido pela diferença de inflação Brasil-EUA, não ao nominal fixo |
| **Reprodutibilidade** | Seed opcional replica qualquer simulação exatamente (PRNG Mulberry32) |

### Estratégias de saque

| Estratégia | Descrição |
|------------|-----------|
| **Guyton-Klinger** | Corta o saque quando o portfólio sofre, aumenta quando prospera, pula inflação após ano ruim (parâmetros do paper de 2006) |
| **Bucket Strategy** | Primeiros anos sacando só de renda fixa — protege a RV de venda forçada na baixa |
| **Rebalanceamento por saque** | Após ano forte de RV, o saque vem da RV e rebalanceia de graça |
| **Spending Smile (Blanchett)** | Gasto em "U": mais no início (viagens), menos no meio, mais no fim (saúde) |
| **Saque Mínimo Garantido** | Piso de gasto corrigido pelo IPCA — o modelo nunca assume que você vai viver com menos que isso |
| **Benefício INSS** | A partir da idade de elegibilidade, o INSS reduz o que o portfólio precisa financiar |

### Fase de Acumulação e aba Projeção

| Funcionalidade | Descrição |
|----------------|-----------|
| **Acumulação estocástica** | Os anos de poupança sorteiam os mesmos retornos aleatórios da aposentadoria — um 2008 no seu segundo ano de aportes é diferente de um no oitavo, e o modelo sabe disso |
| **Aportes indexados** | Aporte mensal corrigido pelo IPCA simulado, dividido entre as sleeves USD/BRL ao câmbio de cada ano |
| **Modo Taxa vs. Gasto Alvo** | Primeiro saque como % do patrimônio na aposentadoria, ou como o seu gasto real de hoje levado até lá |
| **Card "Se Parar Hoje"** | Sobrevivência (bruta e ajustada por mortalidade) gastando o gasto-alvo, com zero anos extras de trabalho |
| **Curva por idade** | Gasto mensal sustentável vs. idade de aposentadoria, com referência ao seu gasto-alvo |
| **Tabela de idades** | Patrimônio real projetado, SWR sustentável e sobrevivência no gasto-alvo, ano a ano |

### Backtesting Histórico

| Funcionalidade | Descrição |
|----------------|-----------|
| **Dados 1995-2024** | 30 anos pós-Plano Real: S&P 500, CDI/Selic, IPCA, câmbio BRL/USD e Treasuries americanos |
| **Janelas rolantes** | A estratégia completa testada a partir de cada ano inicial possível |
| **Gráfico spaghetti** | Todas as trajetórias sobrepostas — sobreviventes, falhas, melhor e pior início |
| **Comparativo Monte Carlo** | Taxa de sucesso histórica lado a lado com a simulada |
| **Tabela de janelas** | Cada ano de início com status, patrimônio final e pior saque, ordenável |

### Otimizador de Consumo Máximo (Die With Zero)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Bissecção em duas fases** | Busca grossa (200 iter.) → busca fina (1000 iter.) → validação completa |
| **Confiança parametrizável** | Defina a probabilidade de sucesso que você aceita (70% a 99%) |
| **Patrimônio final alvo** | R$ 0 maximiza consumo; valores maiores reservam herança em valores reais de hoje |

### Simulador Yale Endowment (`endowment.html`)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Fórmula Yale** | Pondera o saque anterior e o valor do portfólio para suavizar a renda ano a ano |
| **Comparativo 3 estratégias** | Endowment, SWR fixo e Guyton-Klinger na mesma simulação, mesmos sorteios de mercado |
| **Métricas lado a lado** | Mediana, pior saque, taxa de sucesso e patrimônio final por estratégia |

### Ajuste por Mortalidade (IBGE)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Tábua IBGE 2023** | Probabilidades de morte por idade (0-110), masculino e feminino |
| **Taxa ajustada** | Uma falha do portfólio aos 95 anos pesa menos que aos 65 — porque você provavelmente não estará lá para vê-la |
| **Perfis** | Masculino, feminino ou casal (ao menos um dos dois vivo) |

### Análise de Stress

| Análise | O que mede |
|---------|------------|
| **Duração** | Quanto tempo consecutivo o saque mínimo precisou ser forçado |
| **Tolerância** | "Se eu aguento X anos de aperto, qual minha taxa de sucesso?" |
| **Impacto** | Quanto a mais foi sacado vs. o que Guyton-Klinger recomendava |
| **Recuperação** | Fração dos períodos de aperto que o mercado eventualmente resolveu |

### Perfil Local (privacidade)

Para usar seus dados financeiros reais sem publicá-los: copie `js/local-profile.example.js` para `js/local-profile.js` (gitignorado) e preencha seus valores. Qualquer parâmetro do app pode ser sobrescrito ali. Os defaults do repositório são genéricos e ilustrativos.

### Interface

| Funcionalidade | Descrição |
|----------------|-----------|
| **Modo Simples / Avançado** | Simples mostra o essencial; Avançado expõe todos os parâmetros |
| **Entrada dual USD/BRL** | Todos os campos monetários aceitam qualquer moeda, com conversão automática |
| **Tooltips em português** | Cada parâmetro tem explicação clicável com contexto e valores típicos |
| **Exportar resultados** | Relatório em texto com todos os parâmetros e métricas |
| **Layout responsivo** | Desktop, tablet e celular |

---

## Interface: Modo Simples e Avançado

O modo **Simples** (padrão) mostra o essencial: objetivo, portfólio, câmbio, taxa de retirada, fase de acumulação e configuração da simulação. Tudo o mais roda com os defaults calibrados.

O modo **Avançado** expõe retornos esperados, estratégia tenda, regras Guyton-Klinger, saque mínimo, buckets, spending smile, mortalidade, INSS e a modelagem avançada (T-Student, correlação dinâmica, IPCA, bonds americanos, tributação, regime-switching).

Trocar de modo não reseta nada — um valor ajustado no Avançado continua valendo no Simples.

---

## Teoria Financeira

### Regras de Guyton-Klinger

Desenvolvidas por Jonathan Guyton e William Klinger (2006), ajustam o saque conforme o portfólio se comporta:

#### 1. Preservação de capital
```
SE taxa_atual > taxa_inicial × (1 + gatilho)
ENTÃO reduzir saque em X%
```
Corta o gasto quando os saques estão consumindo o patrimônio rápido demais.

#### 2. Prosperidade
```
SENÃO SE taxa_atual < taxa_inicial × (1 - gatilho)
ENTÃO aumentar saque em X%
```
Libera mais gasto quando o portfólio cresceu além do esperado.

As duas regras são mutuamente exclusivas — no máximo uma dispara por ano, e a preservação tem prioridade.

#### 3. Inflação
```
SE retorno_ano_anterior < 0
ENTÃO não corrigir o saque pela inflação neste ano
```
Aceita uma perda temporária de poder de compra para não vender mais ativos num ano ruim.

### Estratégia de Buckets

Baseada em Harold Evensky. Nos primeiros N anos, os saques vêm exclusivamente da renda fixa:

```
Anos 1-5: saques APENAS da RF
→ a RV nunca é vendida na baixa nos anos mais perigosos
```

O maior risco de uma aposentadoria não é o retorno médio — é a *ordem* dos retornos. Uma sequência ruim nos primeiros anos, com saques forçando venda de RV desvalorizada, destrói um plano que sobreviveria à mesma sequência dez anos depois. O bucket compra tempo.

### Denominação de moeda: sleeves e ordem de funding

- **Sleeve USD**: RV global + renda fixa em dólar (parâmetros "Bonds EUA"). Sofre variação cambial.
- **Sleeve BRL**: renda fixa brasileira (IPCA + spread real). Sem exposição cambial.

O gasto-alvo é denominado em BRL (é o que você paga no mercado) e cresce pelo IPCA simulado, nunca pela variação cambial. A conversão para USD só acontece na hora de dimensionar a venda da sleeve em dólar, ao câmbio daquele ano.

Cada saque drena primeiro a sleeve BRL (paga contas em reais sem conversão); o restante vem da sleeve USD. O plano só falha quando **as duas** sleeves zeram.

### T-Student vs. Normal

Mercados têm caudas gordas — crashes acontecem com mais frequência do que a Normal prevê:

| Distribuição | Kurtosis | Eventos -3σ |
|--------------|----------|-------------|
| Normal | 3.0 | 0.13% |
| T-Student (df=8) | ~4.5 | ~0.5% |
| T-Student (df=5) | 9.0 | 1.24% |
| S&P 500 (retornos anuais) | ~4-5 | ~0.5% |

Retornos *diários* têm caudas muito gordas (df≈3-5), mas o simulador trabalha com retornos *anuais*, que agregam centenas de pregões e ficam mais próximos da Normal. O default df=8 reflete isso; use df=5 se quiser estressar cenários extremos.

### Correlação dinâmica BRL/USD

Nos dados anuais 1996-2024, a correlação realizada entre S&P 500 e a variação do BRL/USD foi -0.33. Em crises ela intensifica:

```
Condição normal:  ρ = -0.35
Crise moderada:   ρ = -0.55
Crise severa:     ρ = -0.70 a -0.80
```

O choque cambial de cada ano é correlacionado com o retorno de RV efetivamente sorteado naquele ano (padronizado em z-score), então a correlação realizada na simulação bate com o parâmetro. A reversão à média usa âncora PPP: o câmbio "justo" é o inicial corrigido pelo IPCA acumulado e deflacionado pela inflação americana acumulada. Na prática, o modelo assume que o real se desvaloriza nominalmente ~1.7% a.a. no longo prazo (diferença entre IPCA 4% e CPI 2.3%), com muito ruído no caminho.

### Otimizador de Consumo Máximo

Inverte a pergunta usual:

```
Modo Preservação: "Quero sacar 3.5% — qual a probabilidade de sucesso?"
Modo Consumo:     "Quero 90% de sucesso — quanto posso sacar?"
```

Bissecção em duas fases (busca grossa com 200 iterações → busca fina com 1000 → validação completa), usando o mesmo seed em todos os passos para comparações justas. Todos os parâmetros configurados valem durante a busca — o otimizador só varia a taxa de saque.

Quando "Patrimônio Final Alvo" > 0, o critério de aceitação exige também que o patrimônio final mediano, deflacionado a valores de hoje, atinja o alvo. Deixar herança custa taxa de saque — o otimizador mostra exatamente quanto.

### Estratégia Yale Endowment

A fórmula de David Swensen suaviza a renda ponderando o saque anterior e o valor atual do portfólio:

```
Saque_t = α × (Saque_(t-1) × (1 + inflação)) + (1 - α) × (taxa_alvo × Portfólio_(t-1))
```

Com α=0.7, um crash de 30% não corta sua renda em 30% — o ajuste vem diluído ao longo de anos. O preço: menos resposta quando o portfólio cresce. A página `endowment.html` compara as três abordagens nos mesmos sorteios de mercado.

### Spending Smile

Blanchett (2014) mediu gastos reais de aposentados americanos: caem ~15% no meio da aposentadoria (menos viagens, rotina estabelecida) e voltam a subir no final (saúde). O padrão em "U":

```
Início (120%) → Meio (85%) → Final (110%)
```

O multiplicador é aplicado depois das regras Guyton-Klinger, então os gatilhos de preservação/prosperidade continuam avaliando a taxa sustentável de base. Transições suavizadas por interpolação de cosseno.

### Regime-Switching (Markov de 2 estados)

Anos bons tendem a vir em sequência, e anos ruins também. O modelo IID ignora isso; o regime-switching não:

```
BULL (μ=9.5%, σ=12%)  --0.875--> permanece bull
                      --0.125--> vira bear
BEAR (μ=-5%, σ=25%)   --0.50---> permanece bear
                      --0.50---> vira bull
```

Distribuição estacionária: ~80% bull / ~20% bear, retorno ponderado ~6.6% — consistente com o default de RV. O estado inicial de cada simulação é sorteado da distribuição estacionária, não fixado em bull.

### Ajuste por mortalidade

A taxa de sobrevivência bruta trata igualmente uma falha aos 75 e uma aos 105 anos. Mas você provavelmente não estará vivo aos 105:

```
Peso da falha = P(vivo no ano da falha)

Homem, aposentando aos 60:
  falha aos 75 → P(vivo) ≈ 74% → conta quase inteira
  falha aos 90 → P(vivo) ≈ 25% → conta 1/4
  falha aos 108 → P(vivo) ≈ 0.1% → irrelevante
```

Casal: P(ao menos um vivo) = 1 - (1 - P_homem) × (1 - P_mulher).

A taxa ajustada é a resposta para "qual a chance de EU ver esse plano falhar" — geralmente é ela que deveria orientar a decisão, não a bruta.

### Backtesting Histórico

O Monte Carlo sorteia futuros plausíveis; o backtesting responde uma pergunta diferente: **"e se o futuro repetir exatamente o passado?"**

```
Dados: 1995-2024 (30 anos pós-Plano Real)

Janela 1:  começa em 1995 (30 anos de dados)
Janela 2:  começa em 1996 (29 anos)
...
Janela 26: começa em 2020 (5 anos, mínimo)
```

Cada janela aplica a estratégia completa (Guyton-Klinger, buckets, sleeves, impostos, INSS) contra os retornos reais de S&P 500, CDI, IPCA, Treasuries e câmbio. Quem começou em 1999 pegou o estouro da bolha e a maxidesvalorização do real; quem começou em 2003 surfou cinco anos de bonança. O spaghetti mostra os dois.

**Limitações que você precisa conhecer:**
- 30 anos de dados → horizontes maiores que 30 anos só têm janelas parciais.
- As janelas se sobrepõem (1996-2024 compartilha 29 dos 30 anos com 1995-2024). As taxas de sobrevivência entre janelas ilustram pontos de partida, não são probabilidades independentes.
- O período não inclui hiperinflação pré-Real nem nada pior que 2008.

### Fase de Acumulação e projeção de idade

Quando ativada, `runSimulation()` roda N anos de acumulação antes do laço de aposentadoria. Cada ano de acumulação sorteia os mesmos retornos estocásticos da fase de saques (RV/regime, IPCA, RF em BRL, RF em USD, câmbio): o risco de sequência durante a poupança é real e está no modelo. Não há saques nem falha possível durante a acumulação. O aporte anual é `aporte mensal × 12 × IPCA acumulado × (1 + crescimento real)^ano`, dividido entre as sleeves ao câmbio do ano corrente. Quando o real está fraco, o mesmo aporte compra menos dólares, e o modelo captura isso.

Na fronteira de aposentadoria, o primeiro saque é dimensionado de duas formas:
- **Modo "taxa"**: `withdrawalRate`% do patrimônio na fronteira.
- **Modo "alvo"**: seu gasto real de hoje, corrigido pelo IPCA simulado até lá.

Os relógios de INSS, mortalidade, bucket e tenda começam a contar na fronteira, não no início da simulação.

A varredura (`runRetirementAgeSweep`) repete a simulação de duas fases para cada quantidade de anos extras trabalhados e bissecciona a maior taxa sustentável por idade — é o motor da aba Projeção.

---

## Parâmetros de Entrada

### Objetivo de Vida

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Modo** | Preservação (você define SWR) ou Consumo Máximo (sistema calcula) | Preservação |
| **Confiança Desejada** | Probabilidade mínima de sucesso (modo Consumo) | 90% |
| **Patrimônio Final Alvo** | Herança desejada em valores de hoje (modo Consumo) | R$ 0 |
| **Tolerância da Busca** | Precisão do otimizador | 0.1% |

### Portfólio Inicial

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Patrimônio em USD** | Sleeve dolarizada (RV + bonds EUA) | $800,000 |
| **Patrimônio em BRL** | Sleeve de renda fixa brasileira, sem risco cambial | R$ 1.030.000 |
| **Câmbio Inicial** | BRL/USD — ponto de partida da âncora PPP | 5.15 |
| **Taxa de Retirada (SWR)** | % anual do patrimônio total (modo Preservação) | 3.5% |

> A sleeve USD é dividida entre RV e RF conforme o "% RF Inicial" da Estratégia Tenda. Todos os campos monetários aceitam USD ou BRL.

### Horizonte e Simulação

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Horizonte** | Anos de aposentadoria (até 60) | 58 |
| **Iterações** | Simulações Monte Carlo por execução | 20.000 |
| **Seed** | Semente para reprodutibilidade (vazio = aleatório) | - |

### Fase de Acumulação

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Ativar Acumulação** | Liga a fase de aportes (desligada = comportamento clássico) | Desligado |
| **Anos Trabalhando/Poupando** | Anos de aportes antes da aposentadoria | 0 |
| **Aporte Mensal** | Valor de hoje em BRL, corrigido pelo IPCA simulado | R$ 10.000 |
| **% do Aporte em USD** | Fração comprando ativos dolarizados; o resto vai para a sleeve BRL | 80% |
| **Crescimento Real dos Aportes** | % a.a. real (promoções, carreira) | 0% |
| **Modo de Gasto** | "Taxa" ou "Gasto Alvo" | Taxa |
| **Gasto Alvo Anual** | Gasto real de hoje em BRL — usado no modo "alvo" e na aba Projeção | R$ 180.000 |

### Retornos e Volatilidade

| Parâmetro | Descrição | Default | Base empírica |
|-----------|-----------|---------|---------------|
| **Retorno RV** | Nominal USD, RV global | 6.5% | Projeções institucionais 2026: 4-7%; histórico S&P: ~10% |
| **Volatilidade RV** | Desvio padrão anual | 18% | S&P 500: ~19.7% |
| **Retorno RF Real** | Sleeve BRL, usado só com modelo IPCA desligado | 5.5% | NTN-B |
| **Volatilidade RF** | Sleeve BRL | 3% | Prazo curto/intermediário |
| **Inflação Brasil** | Usada só com modelo IPCA desligado | 4.0% | Focus longo prazo: 3.5% |

### Estratégia Tenda (glide path)

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **RF Inicial** | % da sleeve USD em bonds no início | 40% |
| **Duração da Tenda** | Anos mantendo a alocação inicial | 5 |
| **RF Alvo** | % em bonds após a transição | 40% |

A transição é linear em 3 anos após o fim da tenda (Kitces & Pfau, 2015 — "rising equity glide path" quando o alvo é menor que o inicial).

### Regras de Guyton-Klinger

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Gatilho Preservação** | % acima da taxa inicial para cortar | 20% |
| **Gatilho Prosperidade** | % abaixo da taxa inicial para aumentar | 20% |
| **Ajuste** | Tamanho do corte/aumento | 10% |
| **Regra de Inflação** | Pular correção após ano negativo | Sim |

Valores idênticos aos do paper original (2006).

### Bucket, Saque Mínimo, INSS

| Parâmetro | Default |
|-----------|---------|
| **Bucket Strategy** | Ativo, 5 anos |
| **Saque Mínimo Garantido** | Ativo, R$ 120.000/ano (R$ 10k/mês, em valores de hoje) |
| **INSS** | Ativo: R$ 4.000/mês a partir dos 65 anos |
| **Idade Atual** | 42 anos |

> O saque nunca fica abaixo do mínimo (corrigido pelo IPCA), mesmo que isso acelere a depleção — é o realismo de que ninguém corta o gasto abaixo do próprio custo de vida. Com INSS ativo, o mínimo se aplica ao que o portfólio precisa cobrir após a renda previdenciária. As métricas de saque reportam a renda total (portfólio + INSS).

### Curva de Gastos (Spending Smile)

| Parâmetro | Default |
|-----------|---------|
| **Ativar** | Não |
| **Multiplicadores início/meio/fim** | 1.20 / 0.85 / 1.10 |

### Modelagem Avançada

| Parâmetro | Descrição | Default | Base empírica |
|-----------|-----------|---------|---------------|
| **T-Student** | Caudas gordas | Sim, df=8 | Retornos anuais: df 8-15 |
| **Correlação Base** | RV vs. variação BRL/USD | -0.35 | Realizada 1996-2024: -0.33 |
| **Multiplicador Stress** | Intensificação em crises | 2.0x | 2008/2015/2020: até -0.8 |
| **Modelo IPCA** | RF BRL = IPCA + spread | Sim | - |
| **IPCA Esperado** | Média do processo simulado | 4.0% | Focus jul/2026: 5.3% (2026) → 3.5% (longo prazo) |
| **Volatilidade IPCA** | Desvio padrão anual | 2.0% | 2005-2024: ~1.9pp |
| **Spread Real** | Juro real da sleeve BRL | 5.5% | NTN-B 2026: 7%+; neutro BCB: 4.5-5.5% |
| **Inflação EUA** | Âncora PPP do câmbio | 2.3% | Breakeven 10a jul/2026: ~2.2% |
| **Retorno Bonds EUA** | RF da sleeve USD | 4.7% | Treasury 10a: ~4.6%; consenso: 4.7% |
| **Volatilidade Bonds EUA** | RF da sleeve USD | 6.0% | Agregado: 5-6% |
| **IR RV / IR RF** | Alíquotas sobre ganhos | 15% / 15% | Lei 14.754/2023; tabela regressiva >720d |

### Regime-Switching

| Parâmetro | Default |
|-----------|---------|
| **Ativar** | Não |
| **Bull** | μ=9.5%, σ=12%, P(permanece)=0.875 |
| **Bear** | μ=-5%, σ=25%, P(permanece)=0.50 |

Blend estacionário ≈ 6.6%, consistente com o retorno de RV default. Referências: Hamilton (1989), Ang & Bekaert (2002).

### Ajuste por Mortalidade

| Parâmetro | Default |
|-----------|---------|
| **Ativar** | Sim |
| **Perfil** | Masculino |

Fonte: Tábua Completa de Mortalidade IBGE 2023.

---

## Calibração dos Defaults

Os defaults foram calibrados em julho de 2026 contra dados de mercado e projeções institucionais. São um retrato datado — reveja quando o cenário mudar.

**Retorno RV 6.5%**: o S&P 500 rendeu ~10% nominal desde 1928, mas as projeções de 10 anos das grandes gestoras (Vanguard, BlackRock, JPMorgan, AQR) estavam em 4-7% em 2026, com o CAPE de Shiller perto de 41x — território de máxima histórica. 6.5% pondera o curto prazo comprimido com a reversão de décadas. Se você prefere o histórico puro, suba para 8-10% e saiba o que está assumindo.

**SWR 3.5%**: Bengen achou 4% para 30 anos nos EUA. Pfau (2010) achou ~3.5% em dados internacionais. Para horizontes de 50+ anos com risco cambial, 3.5% é o ponto de partida honesto — o otimizador existe justamente para você encontrar o seu número.

**IPCA 4.0%**: o Focus de julho/2026 projetava 5.3% para 2026 convergindo a 3.5% no longo prazo, com a meta em 3%. O Brasil historicamente ancora acima da meta; 4% é o meio-termo.

**Spread real 5.5%**: as NTN-B longas pagavam IPCA+7.3-8.3% em 2026 — nível que embute prêmio de risco fiscal. O juro real neutro estimado pelo BC é 4.5-5.5%. Para uma simulação de décadas, travar 7% seria otimismo; 5.5% ainda é generoso.

**Câmbio 5.15 e inflação EUA 2.3%**: spot e breakeven de julho/2026. Com IPCA a 4%, a âncora PPP implica desvalorização nominal do real de ~1.7% a.a. no longo prazo.

**Correlação -0.35**: calculada dos próprios dados históricos do repositório (1996-2024): -0.33.

**df=8**: retornos anuais são mais próximos da Normal que os diários (df 3-5). Se quiser pessimismo de cauda, use 5.

**Guyton-Klinger 20/20/10 e tributação 15%**: paper original e Lei 14.754/2023, respectivamente.

---

## Interpretação dos Resultados

### Aba Monte Carlo

**Card Taxa de Sobrevivência** — com mortalidade ativa, a taxa ajustada aparece em destaque e a bruta como subtítulo. Guia de leitura:

| Taxa ajustada | Leitura |
|------|---------------|
| > 97% | Plano robusto |
| 93-97% | Risco aceitável para a maioria |
| 85-93% | Funciona se você tem flexibilidade real de gasto |
| < 85% | Reveja: menos gasto, mais anos de aporte, ou mais portfólio |

**Evolução do Portfólio** — bandas P10/P25/P50/P75/P90. A mediana é o cenário central; o P10 é o que você deveria conseguir sobreviver.

**Evolução dos Saques** — média e mediana dos saques, linha do mínimo (se ativo) e renda INSS a partir da elegibilidade. Os cards mostram o equivalente mensal para comparar direto com seu custo de vida.

**Análise de Stress** — quando o saque mínimo está ativo: quanto tempo ele precisou ser forçado, quanto custou vs. a recomendação Guyton-Klinger e que fração dos apertos o mercado resolveu.

### Aba Backtesting Histórico

Aparece após rodar o Monte Carlo. Cards de visão geral (sobrevivência histórica vs. simulada, janelas testadas, pior saque), gráfico spaghetti com cada trajetória histórica, bandas de percentil e a tabela de janelas ordenável. Se a sua estratégia quebra na janela de 1999 ou 2000, você quer saber disso antes de se aposentar — essas janelas incluem a bolha ponto-com, a maxidesvalorização de 2002 e a crise de 2008 em sequência.

### Aba Projeção

Aparece após rodar o Monte Carlo; o primeiro clique dispara a varredura (10-30 segundos, com barra de progresso).

- **Card "Se parar hoje"**: sobrevivência bruta e ajustada gastando seu gasto-alvo com zero anos extras. É o seu número de emergência — o que acontece se a renda acabar amanhã.
- **Curva de gasto sustentável**: duas séries (critério conservador, 83% de sobrevivência bruta; critério ajustado por mortalidade, 96.5%) contra a idade de aposentadoria, com linha de referência no seu gasto-alvo. O cruzamento é a resposta de "quando".
- **Tabela por idade**: patrimônio real projetado (mediana, em valores de hoje), SWR sustentável pelos dois critérios, gasto mensal equivalente e sobrevivência no seu gasto-alvo.

A varredura usa o aporte mensal configurado na sidebar, mesmo com o toggle de acumulação desligado (o toggle controla só a aba Monte Carlo).

### Card do Otimizador (modo Consumo)

```
Taxa Ótima: 5.23% (±0.1%)
Saque Mensal: R$ 24.000
Sobrevivência Validada: 90.5%
Patrimônio Final Mediano: R$ 125.000
```

A taxa ótima é a maior que atende sua confiança (e o patrimônio final alvo, se definido), validada com a simulação completa.

---

## Instalação e Uso

### Online

- **Principal**: https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/
- **Yale Endowment**: https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/endowment.html

### Local

```bash
git clone https://github.com/alexfmonteiro/monte-carlo-retirement-simulator.git
cd monte-carlo-retirement-simulator
python -m http.server 8000
# http://localhost:8000            → simulador principal
# http://localhost:8000/endowment.html → Yale Endowment
```

O servidor local é necessário — abrir `index.html` direto do arquivo não funciona (o Babel carrega os scripts via XHR).

**Seus dados reais**: copie `js/local-profile.example.js` para `js/local-profile.js` e preencha. O arquivo é gitignorado; seus números nunca vão para o repositório, e o app abre direto no seu caso.

### Testes

```bash
python -m http.server 8000
# http://localhost:8000/tests.html → clique "Run All Tests"

# ou o smoke test sem navegador:
node scripts/smoke.js
```

A suíte cobre distribuições estatísticas, regras Guyton-Klinger, impostos, modelo IPCA, correlação FX realizada, integração das sleeves BRL/USD, denominação do gasto em BRL, fase de acumulação (indexação de aportes, fronteira, modo alvo), varredura de idades, reprodutibilidade com seed, otimizador e regressão E2E.

### GitHub Pages

Fork → Settings → Pages → branch `main`, pasta `/` (root). O site publica os defaults genéricos; seu `local-profile.js` fica só na sua máquina.

---

## Metodologia Técnica

### Geração de números aleatórios

**Mulberry32** (PRNG seedável, período 2³²) → **Box-Muller** para a Normal → **T-Student** via razão `T = Z/√(χ²/df)` com fator de escala `√((df-2)/df)` para preservar a variância.

### Correlação

```javascript
Z₂_correlacionado = ρ × Z₁ + √(1-ρ²) × Z₂
```

No câmbio, `Z₁` é o z-score do retorno de RV efetivamente sorteado no ano — a correlação realizada bate com o parâmetro.

### Simulação de câmbio

1. Choque correlacionado com o equity realizado (acima)
2. Reversão à média com âncora PPP: justo = inicial × IPCA acumulado ÷ inflação EUA acumulada
3. Volatilidade 1.3x em anos de RV negativa

### Impostos

```javascript
Imposto = Saque × Proporção_Ganhos × Alíquota
```

A proporção de ganhos cresce com o tempo (heurística: 6% a.a. até 60%) — quanto mais velho o portfólio, mais do saque é ganho tributável.

### Otimizador

Bissecção sobre a taxa de saque com seed fixo entre os passos. Fase grossa (200 iterações/passo) estreita o intervalo; fase fina (1000/passo) refina; validação final roda a simulação completa. Total típico: ~5.000 + N simulações.

### Fase de acumulação

Mesmo laço estocástico da aposentadoria, sem saques: aportes IPCA-indexados divididos entre sleeves ao câmbio corrente. Com a feature desligada, o caminho de execução é idêntico ao anterior (verificado bit a bit com seed fixo).

---

## Referências Acadêmicas

1. **Bengen, W. P. (1994)**. "Determining Withdrawal Rates Using Historical Data." *Journal of Financial Planning*.
2. **Guyton, J. T., & Klinger, W. J. (2006)**. "Decision Rules and Maximum Initial Withdrawal Rates." *Journal of Financial Planning*.
3. **Pfau, W. D. (2010)**. "An International Perspective on Safe Withdrawal Rates from Retirement Savings." *Journal of Financial Planning*.
4. **Kitces, M. E., & Pfau, W. D. (2015)**. "Retirement Risk, Rising Equity Glide Paths, and Valuation-Based Asset Allocation." *Journal of Financial Planning*.
5. **Estrada, J. (2017)**. "Maximum Withdrawal Rates: An Empirical and Global Perspective." *Journal of Retirement*.
6. **Pfau, W. D. (2018)**. *How Much Can I Spend in Retirement?* Retirement Researcher Media.
7. **Perkins, B. (2020)**. *Die With Zero*. Houghton Mifflin Harcourt.
8. **Blanchett, D. (2014)**. "Estimating the True Cost of Retirement." *Morningstar Investment Management*.
9. **Hamilton, J. D. (1989)**. "A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle." *Econometrica*.
10. **Ang, A., & Bekaert, G. (2002)**. "Regime Switches in Interest Rates." *Journal of Business & Economic Statistics*.
11. **Brasil, Lei 14.754/2023**. Tributação de investimentos no exterior — alíquota de 15% sobre rendimentos offshore.
12. **IBGE (2023)**. "Tábuas Completas de Mortalidade — Brasil."

---

## Licença

MIT — veja [LICENSE](LICENSE).

## Contribuições

Abra uma issue antes de mudanças grandes. PRs com testes são bem-vindos.

## Disclaimer

Ferramenta educacional e de planejamento. Não é aconselhamento financeiro — os defaults são um retrato de julho/2026 e envelhecem. Consulte um profissional certificado antes de decisões de investimento.

---

Feito para a comunidade FIRE brasileira, por alguém fazendo as mesmas contas.
