# Financeiro administrativo

A aba Financeiro consulta `billing-finance`, uma Edge Function somente de leitura.
A função valida a sessão em Auth e a permissão/MFA em `billing_test_is_admin`
antes de ler, com a credencial do servidor, colunas explícitas das tabelas de
produção. Não expõe tokens, chaves, hashes de webhook ou dados de cartão.
Não altera acesso, assinatura, cobrança ou configurações; não chama Mercado Pago.
Não exige migração ou novas permissões de tabelas.

- Recebido: pagamentos com aprovação confirmada menos estornos/chargebacks conhecidos.
- Valores antes das taxas; não representam saldo disponível ou extrato de repasses.
- Estornos ajustam o mês da aprovação original (não existe data contábil do estorno no ledger atual).
- Anuais entram integralmente no mês de aprovação; datas em America/Sao_Paulo.
- Em processamento: pagamentos pendentes/contestados já registrados no mês.
- Checkout sem pagamento é listado em atenção, não como dívida ou receita.
- Previsão: apenas contratos autorizados, sem conferência pendente, cujo período
  pago vence nos próximos 30 dias; estimativa, sem chamada ao calendário do provedor.
- Testes e liberações manuais ficam fora dos registros de produção.
- Paginação por chave de 500 linhas; falha explícita acima de 100 mil registros por
  tabela, nunca retorna totais truncados. Lista visual de 50 por página; CSV exporta
  todas as linhas filtradas. Nenhum cache persistente de dados financeiros.
- Atualizar consulta o ledger já sincronizado; o job/webhook de produção continua
  sendo responsável por confirmar as transações no provedor.

Validação:

```
node --test tests/finance.test.cjs tests/finance-api.test.mjs tests/billing-production.test.mjs
node tests/finance-browser.cjs
```

Browser: página admin real com transporte simulado. Cobre filtros, paginação, CSV,
segurança de nomes, erro de permissão, registro vazio, limpeza ao sair e layouts
1440/390. Nenhuma cobrança real é feita pelos testes.
