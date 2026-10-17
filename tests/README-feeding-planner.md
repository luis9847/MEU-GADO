# Planejamento alimentar de engorda

Aba `Planejamento alimentar` em `/app#planejamento`, acessível a proprietário e gerente.

- Cadastro por fazenda: nome, tipo, preço por kg natural, estoque manual/data e composição opcional (MS, PB e NDT).
- Planos por lote: pasto, semi ou confinamento, vigência, kg/animal/dia, divisão igual por tratos e referência técnica.
- Quantidade e custo calculados com animais ativos atuais; preços/composição são snapshots do último salvamento do plano.
- O banco valida propriedade, alimentos, quantidades e impede planos com vigências sobrepostas no mesmo lote. Edições usam revisão otimista.
- Consulta offline após carregar online; gravações desta aba exigem conexão e não entram na fila offline existente.
- Preparar lançamento abre o formulário existente de Alimentação com o total diário. O produtor deve conferir o fornecido e salvar; o fluxo existente integra o custo a Gastos. Um aviso detecta lançamentos já carregados do mesmo plano/alimento/data; não é uma trava global contra duas pessoas lançarem ao mesmo tempo.
- Estoque é projeção a partir de saldo manual e demanda dos planos de hoje, sem baixa automática. A comparação planejado/fornecido soma registros do lote e do dia; não mede ingestão real, sobras nem consumo de pasto.
- Não há formulação automática de dieta, recomendação de dose ou promessa de ganho. Validar quantidades e composição com profissional.

## Implantação

`db/feeding-planner.sql` é o script aditivo aplicado ao banco. A integração usa as funções de autorização existentes `has_farm_role`. Não altera registros anteriores. O retorno da interface pode ser feito revertendo o commit, mantendo as tabelas para preservar planos cadastrados.

## Validação

- `node --test tests/feeding-planner.test.cjs`: cálculos, valores ausentes, animais ativos, projeção e vigência.
- `tests/feeding-planner-rls.sql`: testes transacionais com rollback, usando vínculos de fazendas já existentes, sem deixar registros de teste. Verifica persistência, snapshots, leitura/escrita de outra fazenda, usuário sem vínculo, anônimo, sobreposição e edição concorrente.
- `node tests/feeding-planner-browser.cjs` (Playwright, com `CHROMIUM_PATH` se necessário): integração da interface com transporte simulado, screenshots desktop/mobile, formulários, consulta offline e integração com o formulário existente. Persistência real e isolamento são cobertos separadamente pelo teste SQL.
- Parse dos scripts inline de `app.html` e `node --check` nos scripts externos.

## Teste pelo produtor

1. Cadastre um alimento com preço/kg, estoque e data; salve, recarregue e confira.
2. Crie plano em um lote com animais ativos, adicione quantidades, manejo e tratos.
3. Confira kg/animal/dia, kg/lote/dia e kg/trato; consulte os custos.
4. Edite alimento e plano para confirmar que atualizar o catálogo não altera os snapshots de um plano sem salvá-lo novamente.
5. Em Ver fornecimento, prepare um lançamento, ajuste à quantidade realmente fornecida e salve em Alimentação; retorne e confira a comparação.
6. Arquive o plano de teste. Não cadastre dietas reais sem orientação técnica.
