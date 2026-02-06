# 📊 Monte Carlo Retirement Simulator

Um simulador avançado de aposentadoria baseado em simulações de Monte Carlo, implementando as regras de Guyton-Klinger para saques dinâmicos, estratégia de buckets, e modelagem financeira de nível institucional.

🔗 **[Acesse a ferramenta online](https://alexfmonteiro.github.io/monte-carlo-retirement-simulator/)**

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Teoria Financeira](#-teoria-financeira)
- [Parâmetros de Entrada](#-parâmetros-de-entrada)
- [Interpretação dos Resultados](#-interpretação-dos-resultados)
- [Instalação e Uso](#-instalação-e-uso)
- [Metodologia Técnica](#-metodologia-técnica)
- [Referências Acadêmicas](#-referências-acadêmicas)

---

## 🎯 Visão Geral

Este simulador foi desenvolvido para investidores brasileiros que possuem portfólios diversificados internacionalmente (como ETFs irlandeses) e precisam planejar saques sustentáveis durante a aposentadoria.

### Problema que Resolve

A clássica "Regra dos 4%" foi desenvolvida para o mercado americano com condições específicas. Para brasileiros, existem fatores adicionais críticos:

- **Risco cambial**: Patrimônio em USD, despesas em BRL
- **Inflação brasileira**: IPCA historicamente mais volátil que CPI
- **Tributação diferenciada**: ETFs irlandeses (15%) vs. Renda Fixa BR (tabela regressiva)
- **Correlação inversa**: Real tende a desvalorizar quando bolsas caem

---

## ✨ Funcionalidades

### Modelagem Avançada de Retornos

| Funcionalidade | Descrição |
|----------------|-----------|
| **Distribuição T-Student** | Captura "cisnes negros" com caudas mais gordas que a Normal |
| **Limite de Bear Markets** | Restringe sequências de retornos negativos ao máximo histórico |
| **Correlação Dinâmica** | Correlação USD/BRL intensifica em crises |
| **Modelo IPCA + Juro Real** | RF modelada como IPCA + spread, evitando juros reais negativos irrealistas |

### Estratégias de Saque

| Estratégia | Descrição |
|------------|-----------|
| **Guyton-Klinger** | Regras dinâmicas de preservação, prosperidade e inflação |
| **Bucket Strategy** | Proteção contra sequence of returns risk |
| **Rebalanceamento Inteligente** | Saque de RV quando acima do alvo para rebalancear |
| **Saque Mínimo Garantido** | Nunca sacar menos que o necessário para sobreviver |

### Análise de Stress

| Análise | O que mede |
|---------|------------|
| **Duração** | Quanto tempo o saque mínimo foi necessário |
| **Tolerância** | Quantos anos de stress você precisa tolerar para X% de sucesso |
| **Impacto no Portfólio** | Quanto a mais foi sacado vs. recomendado |
| **Recuperação** | % dos períodos de stress que eventualmente se recuperam |

---

## 📚 Teoria Financeira

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
SE taxa_atual < taxa_inicial × (1 - threshold)
ENTÃO aumentar saque em X%
```
**Objetivo**: Permitir melhor qualidade de vida quando o portfólio cresceu significativamente.

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
│ Protege a Renda Variável de vendas forçadas    │
│ durante quedas de mercado                       │
└─────────────────────────────────────────────────┘
```

**Por quê funciona**: O maior risco na aposentadoria é o "Sequence of Returns Risk" — uma sequência de retornos ruins no início pode devastar o portfólio. Mantendo 5+ anos em RF, você nunca precisa vender RV na baixa.

### Rebalanceamento Inteligente por Saque

Nova funcionalidade que otimiza a fonte dos saques:

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

Usar T-Student com 5-7 graus de liberdade captura melhor a probabilidade de crashes como 2008 ou 2020.

### Correlação Dinâmica BRL/USD

Em condições normais, a correlação entre retornos de RV e câmbio é aproximadamente -0.4 (quando bolsa cai, dólar sobe). Mas em crises extremas:

```
Condição Normal:   ρ = -0.40
Crise Moderada:    ρ = -0.60
Crise Severa:      ρ = -0.80
```

O simulador modela isso dinamicamente baseado na severidade da queda.

---

## ⚙️ Parâmetros de Entrada

### Portfólio Inicial

| Parâmetro | Descrição | Valores Típicos |
|-----------|-----------|-----------------|
| **Modo de Entrada** | USD ou BRL | - |
| **Valor em USD** | Patrimônio em dólares | $500k - $2M |
| **Valor em BRL** | Patrimônio em reais | R$ 2.5M - R$ 10M |
| **Taxa de Câmbio** | USD/BRL inicial | 4.80 - 6.00 |
| **Taxa de Retirada (SWR)** | % anual do portfólio inicial | 3.5% - 5.0% |

> **Nota**: A variação cambial afeta APENAS a renda variável. A renda fixa brasileira não tem exposição ao dólar.

### Retornos e Volatilidade

| Parâmetro | Descrição | Default | Histórico |
|-----------|-----------|---------|-----------|
| **Retorno RV** | Retorno esperado da renda variável | 7.0% | S&P 500: ~10% nominal |
| **Volatilidade RV** | Desvio padrão anual | 18.0% | S&P 500: ~16% |
| **Retorno RF** | Retorno da renda fixa (se não usar modelo IPCA) | 4.0% | - |
| **Volatilidade RF** | Desvio padrão RF | 6.0% | - |
| **Inflação** | Inflação anual esperada | 4.5% | IPCA médio |

### Horizonte e Simulação

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Anos** | Horizonte de aposentadoria | 30 |
| **Iterações** | Número de simulações Monte Carlo | 2000 |
| **Máx. Anos Negativos** | Limite de anos consecutivos de queda | 10 |

> O limite de anos negativos previne cenários irrealistas. Historicamente, o S&P 500 nunca teve mais de 4 anos consecutivos negativos (1929-1932).

### Estratégia Tenda (Bond Tent)

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **RF Inicial** | % em renda fixa no início | 35% |
| **Duração Tenda** | Anos de alta alocação em RF | 5 |
| **RF Alvo** | % em renda fixa após transição | 20% |

A estratégia "Tenda" começa com mais RF e gradualmente reduz, criando uma curva em forma de tenda invertida.

### Regras de Guyton-Klinger

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Gatilho Preservação** | % acima da taxa inicial para cortar | 20% |
| **Gatilho Prosperidade** | % abaixo da taxa inicial para aumentar | 20% |
| **Ajuste** | % de ajuste quando regra dispara | 10% |
| **Aplicar Regra de Inflação** | Pular inflação após anos ruins | Sim |

### Bucket Strategy

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Buckets** | Ativar estratégia de reserva | Sim |
| **Anos de Proteção** | Anos sacando só da RF | 5 |
| **Rebalanceamento** | Sacar de RV quando acima do alvo | Sim |
| **Threshold Rebalanceamento** | % de desvio para disparar | 5% |

### Saque Mínimo

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **Usar Mínimo** | Ativar saque mínimo garantido | Não |
| **Valor Mínimo** | Saque mínimo anual em BRL | R$ 200.000 |

> **Importante**: O saque NUNCA será menor que o mínimo definido, mesmo que isso acelere a depleção do portfólio.

### Modelagem Avançada

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| **T-Student** | Usar distribuição com caudas gordas | Sim |
| **Graus de Liberdade** | Menor = caudas mais gordas | 5 |
| **Correlação Dinâmica** | Correlação FX intensifica em crises | Sim |
| **Modelo IPCA** | RF = IPCA + Juro Real | Sim |
| **IPCA Esperado** | IPCA médio esperado | 4.5% |
| **Spread Real** | Juro real sobre IPCA | 5.5% |
| **Modelo Tributário** | Descontar IR dos saques | Sim |
| **IR RV** | Alíquota sobre ganhos de RV | 15% |
| **IR RF** | Alíquota sobre rendimentos RF | 15% |

---

## 📈 Interpretação dos Resultados

### Card: Taxa de Sobrevivência

```
Taxa de Sobrevivência: 94.2%
```

**O que significa**: Em 94.2% das 2000 simulações, o portfólio não zerou em 30 anos.

| Taxa | Interpretação |
|------|---------------|
| > 95% | Excelente - estratégia muito robusta |
| 90-95% | Bom - risco aceitável para maioria |
| 80-90% | Atenção - considere ajustes |
| < 80% | Risco elevado - revise parâmetros |

### Card: Saque Médio

```
Saque Médio: R$ 285.000/ano
Mediana: R$ 268.000/ano
```

**O que significa**: 
- **Média**: Valor esperado considerando todos os cenários
- **Mediana**: Metade dos cenários fica acima, metade abaixo

Se média > mediana, cenários positivos estão puxando a média para cima.

### Card: Pior Saque

```
Pior Saque: R$ 165.000
```

**O que significa**: O menor saque anual em qualquer simulação bem-sucedida. Se você definiu saque mínimo, este valor será igual ou maior que o mínimo.

### Gráfico: Evolução do Portfólio

Mostra bandas de percentis ao longo do tempo:
- **P90** (linha superior): 10% melhores cenários
- **P75**: Quartil superior
- **P50** (mediana): Cenário central
- **P25**: Quartil inferior
- **P10** (linha inferior): 10% piores cenários

### Gráfico: Distribuição de Saques

Histograma dos saques anuais mostrando:
- Onde a maioria dos saques se concentra
- Dispersão (quanto variam)
- Presença de outliers

### Seção: Análise de Stress

#### Duração dos Períodos de Stress
Quanto tempo consecutivo o saque mínimo foi necessário (G-K queria dar menos).

#### Taxa de Tolerância vs. Sucesso
"Se eu posso tolerar X anos de stress, qual minha taxa de sucesso?"

```
Tolerância 0 anos: 72% sucesso
Tolerância 2 anos: 89% sucesso
Tolerância 5 anos: 96% sucesso
```

#### Impacto no Portfólio
Quanto a mais foi retirado do portfólio (vs. G-K recomendado) para manter o mínimo.

#### Taxa de Recuperação
% dos períodos de stress onde o mercado eventualmente se recuperou (G-K voltou a recomendar acima do mínimo).

---

## 🚀 Instalação e Uso

### Uso Online (Recomendado)

Simplesmente acesse: **https://seu-usuario.github.io/monte-carlo-retirement-simulator/**

### Uso Local

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/monte-carlo-retirement-simulator.git

# Entre na pasta
cd monte-carlo-retirement-simulator

# Abra no navegador
open index.html
# ou
python -m http.server 8000
# e acesse http://localhost:8000
```

### Hospedagem no GitHub Pages

1. Faça fork deste repositório
2. Vá em Settings > Pages
3. Selecione "main" branch e "/" (root)
4. Aguarde alguns minutos
5. Acesse `https://seu-usuario.github.io/monte-carlo-retirement-simulator/`

---

## 🔬 Metodologia Técnica

### Geração de Números Aleatórios

**Box-Muller Transform** para distribuição Normal:
```javascript
Z = √(-2 ln U₁) × cos(2π U₂)
```

**T-Student** via razão:
```javascript
T = Z / √(χ²/df)
```
onde χ² é soma de df variáveis normais ao quadrado.

### Correlação

Decomposição de Cholesky para gerar variáveis correlacionadas:
```javascript
Z₂_correlacionado = ρ × Z₁ + √(1-ρ²) × Z₂
```

### Simulação de Câmbio

Modelo com:
1. **Correlação com equity**: Quando RV cai, USD sobe
2. **Mean reversion**: Câmbio tende a voltar à média de longo prazo
3. **Stress multiplier**: Volatilidade aumenta em crises

### Cálculo de Impostos

```javascript
Imposto = Saque × Proporção_Ganhos × Alíquota
```
onde Proporção_Ganhos cresce com o tempo (mais do portfólio é ganho, menos é principal).

---

## 📖 Referências Acadêmicas

1. **Bengen, W. P. (1994)**. "Determining Withdrawal Rates Using Historical Data." *Journal of Financial Planning*.

2. **Guyton, J. T., & Klinger, W. J. (2006)**. "Decision Rules and Maximum Initial Withdrawal Rates." *Journal of Financial Planning*.

3. **Kitces, M. E., & Pfau, W. D. (2015)**. "Retirement Risk, Rising Equity Glide Paths, and Valuation-Based Asset Allocation." *Journal of Financial Planning*.

4. **Estrada, J. (2017)**. "Maximum Withdrawal Rates: An Empirical and Global Perspective." *Journal of Retirement*.

5. **Pfau, W. D. (2018)**. *How Much Can I Spend in Retirement?* Retirement Researcher Media.

---

## 📝 Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.

---

## 🤝 Contribuições

Contribuições são bem-vindas! Por favor, abra uma issue primeiro para discutir mudanças significativas.

---

## ⚠️ Disclaimer

Esta ferramenta é apenas para fins educacionais e de planejamento. Não constitui aconselhamento financeiro. Consulte um profissional certificado antes de tomar decisões de investimento.

---

Desenvolvido com ❤️ para a comunidade FIRE brasileira.
