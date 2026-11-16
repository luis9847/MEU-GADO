O Financeiro da Fazenda é do plano Completo, para proprietários e gerentes. A baixa por venda grava o valor e o lote da época; a data do recebimento integral precisa ser informada na tela. Vendas antigas sem valor aparecem como “Sem valor informado”. O saldo usa recebimentos menos gastos do mês, sem dados de assinatura do Meu Gado.

A Agenda usa os registros de saúde e reprodução e permite programar tarefas próprias. As tarefas podem ser consultadas por membros da fazenda; os responsáveis pela gestão podem criar e alterar tarefas. As telas novas precisam de conexão.

Para mostrar a previsão no painel, configure o secret `CLIMATEMPO_ADVISOR_TOKEN` na função `farm-weather` do Supabase, com um token autorizado a consultar municípios e a rota de previsão diária de 15 dias. Verifique a licença, os limites de municípios e o volume permitido antes de habilitar para clientes. A consulta usa cidade e UF do cadastro; a função retorna os primeiros três dias disponíveis. Sem configuração, o painel oferece um link de consulta externa.

Validação: `node --test tests/farm-operations.test.mjs`; `node tests/farm-operations-browser.cjs` com Playwright e `CHROMIUM_PATH`; `tests/farm-operations-rls.sql` em banco migrado, com rollback das contas e registros de teste.
