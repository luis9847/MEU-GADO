# Planos e testes gratuitos

Acesso comercial por fazenda, administrado manualmente em `/admin` → Planos.

- Essencial: R$90/mês, R$900/ano, até 150 animais ativos.
- Completo: R$130/mês, R$1440/ano; também pode ser escolhido por fazendas menores.
- Teste gratuito: plano selecionado, com validade opcional. Não gera cobrança nem conversão automática.
- Situações: aguardando liberação, assinatura liberada, teste gratuito, suspenso.
- Validade: até o fim do dia escolhido no fuso do navegador administrativo; armazenada como instante UTC.
- Após vencimento/suspensão, novos lançamentos ficam impedidos. Dados existentes não são apagados.
- Cobranças, confirmação de pagamentos e renovação são manuais; não há checkout ou provedor de pagamentos.

## Transição

A migração preserva as fazendas existentes com acesso Completo anterior (`legacy`). O administrador deve configurar cada uma. Essa situação de transição não pode ser concedida pela interface ou RPC. Fazendas novas começam aguardando liberação.

## Proteção

A tabela de assinatura é somente leitura para clientes. Apenas RPC administrativa com verificação de administrador e de MFA (quando cadastrado) muda acesso, exige revisão atual e grava auditoria. Não se usa user_metadata para autorização. Funções privilegiadas ficam no schema privado, com verificações de identidade, privilégios explícitos e search_path vazio.

Triggers verificam liberação e vencimento em cada alteração, inclusive replay offline e RPCs existentes. O limite de animais é serializado por lock da assinatura antes da contagem e inclui cadastro, reativação e restauração da lixeira. Gastos e tabelas de planejamento recebem política restritiva adicional. As políticas de isolamento e papéis existentes são preservadas.

Desempenho e exportações gerados no navegador são controles de produto na interface; os dados básicos de pesagem continuam pertencendo ao cliente e não são confidenciais perante ele. O histórico já armazenado num aparelho offline não pode ser apagado remotamente; permissões novas são revalidadas no servidor na sincronização. Entradas rejeitadas ficam na fila com erro para revisão.

O registro de alimentação não cria mais uma despesa automaticamente; a compra deve ser registrada em Gastos, conforme a regra comercial já definida.

## Verificação

- `TZ=America/Sao_Paulo node --test tests/plans.test.cjs tests/weight-metrics.test.cjs tests/feeding-planner.test.cjs`
- `tests/plans-rls.sql` no banco de destino, com todos os dados de teste revertidos. Usa identidades/fazendas temporárias e o administrador existente para simular papéis com JWT local à transação, sem criar sessões de login.
- `CHROMIUM_PATH=/caminho/chromium node tests/plans-browser.cjs`: interface real com transporte simulado, desktop e celular. Cobre salvar teste datado/sem data, suspender, Essencial anual, filtros, bloqueio de páginas premium, expiração e preservação de fila (suite Node).
- Fluxo real autenticado no navegador com a conta do proprietário não foi executado; autorização no banco e interface no navegador foram verificados separadamente.

Migração: `supabase/migrations/20261103170000_farm_plans.sql`. Implantar a migração antes dos arquivos de frontend. Para reverter a interface, restaurar o commit anterior; para reverter regras comerciais, remover apenas os triggers `mg_plan_write_guard` e as políticas `mg_complete_guard` adicionados por esta migração, preservando os registros de assinatura e auditoria. Não remover políticas de isolamento anteriores.
