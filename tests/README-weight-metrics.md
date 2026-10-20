# Indicadores de peso

O GMD individual é a diferença entre a primeira e a última referência válida, dividida pelos dias corridos entre elas. Início, Pesagem, Lotes, ficha, desempenho e custo por ganho utilizam a mesma função `mgWeightMetrics`.

- Data de calendário ISO validada, com diferenças em UTC para evitar variações por horário de verão.
- Apenas pesos positivos e finitos; registros excluídos são ignorados no cálculo.
- Uma referência por dia: vence o registro de edição/criação mais recente, com ID como desempate. Os registros originais continuam no histórico.
- Peso de entrada é referência inicial somente quando anterior à primeira pesagem válida. Uma entrada posterior não é colocada artificialmente no início do gráfico nem substitui a pesagem atual.
- Sem duas datas distintas, GMD é `null` e aparece como `—`. Zero real aparece como `0.000 kg/dia`; perda de peso continua negativa.
- Médias de GMD excluem animais sem histórico suficiente; médias de peso excluem pesos ausentes. Não se aplica corte arbitrário a ganhos elevados: eles exigem conferir os dados de origem.
- Gráficos individuais usam datas em ordem crescente, com ano no rótulo se atravessarem anos. O histórico mensal mantém até 12 meses e usa as mesmas referências válidas.
- O cache do aplicativo é atualizado; a leitura de pesagens continua usando a rota com suporte offline. Sem histórico em cache, a falha não substitui indicadores por resultados vazios.

## Validação

`node --test tests/weight-metrics.test.cjs`

A suíte extrai as funções reais de `app.html` e testa histórico fora de ordem, duplicidades no dia, edição/exclusão, pesos/datas inválidos, GMD positivo/zero/negativo, ausência de histórico, virada de ano e horário de verão, concordância entre rotas/indicadores, ranking, gráfico, histórico mensal e leitura pelo cache offline com transporte simulado. Executada também com `TZ=America/Sao_Paulo` e `TZ=America/New_York`.

Não altera registros no banco. Validação visual no navegador e teste autenticado com dados reais devem ser feitos após atualizar o aplicativo; o ambiente de desenvolvimento não conseguiu instalar o Chromium.

## Conferência no sistema

1. Atualize a página e compare o mesmo animal na ficha e em Desempenho.
2. Compare o GMD médio de Início e Pesagem, com o mesmo rebanho ativo.
3. Confira um lote e a ordem cronológica do gráfico individual.
4. Use apenas um animal de teste para editar/excluir pesagens; confirme a atualização das telas.
5. Após carregar online, desconecte e confira a consulta dos dados em cache.
