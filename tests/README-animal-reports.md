# Relatórios e apresentação dos recursos de animais

A página inicial apresenta cria, recria, engorda e genética, além de registros na associação e filiação direta. O Essencial mantém os recursos de cadastro, classificação e filiação; o Completo mantém relatórios e exportações. Preços e permissões não foram alterados. A comparação continua na contratação, sem retornar à página inicial.

## Relatórios

- Rebanho ativo: número, nome, categoria, raça, atividade, função reprodutiva, condição do macho, nascimento, origem, entrada no confinamento, peso inicial/atual, meta, lote, pai e mãe.
- Registros na associação: animais ativos com algum dado declarado de associação/série/RGN/RGD/categoria do registro. Este arquivo não comprova ou valida registro junto à associação.
- Filiação: pai/mãe dos animais ativos, origem interna/externa e identificação disponível.
- Descendentes: uma linha para cada relação entre pai/mãe da fazenda e descendente cadastrado; inclui baixados e exclui Lixeira. Referências externas não criam animais ou identidades compartilhadas.
- Pesagens, saúde, reprodução, crias e baixas passam a identificar o animal pelo nome junto ao número. O contexto inclui animais baixados e referências históricas para resolver nomes.

Filtros de atividade, raça, lote e categoria se combinam e consideram o cadastro atual. Rebanho, registros, filiação e prontos para venda mostram posição atual, sem período. Nos descendentes, os filtros se aplicam ao ascendente e o período ao nascimento do descendente. Nos demais registros datados, o intervalo é inclusivo; registros sem data não entram quando há período selecionado. Intervalos invertidos são recusados.

Saúde geral/por lote não é atribuída a uma raça/categoria/atividade. Quando há apenas filtro de lote, eventos vinculados ao lote podem atender a esse filtro. Alimentação e gastos usam somente lote. Essas regras aparecem na ajuda ao lado dos filtros e os filtros efetivos constam no PDF.

## Leitura e exportação

Leituras passam pelo cliente Supabase e pelas RLS existentes, com `farm_id` fixado pela fazenda autenticada. Não houve migração ou alteração de permissões. Contexto de animais tem lista explícita de campos, sem fotos inline. Consultas paginam por ID em lotes de 1000 registros. Tipos de tabelas de relatórios são permitidos por lista fechada. As leituras usam o cache existente por usuário no Modo Campo; sem cache/conexão há mensagem de indisponibilidade.

Pesos/GMD usam a mesma função já aplicada às fichas. Zero é preservado, enquanto dado ausente continua vazio. CSV mantém cabeçalhos estruturados, aspas/BOM e neutraliza valores de texto que poderiam ser fórmulas de planilha. Para conservar zeros à esquerda no Excel, importe identificadores como texto.

O PDF abre a janela de impressão imediatamente, apresenta mensagem enquanto carrega e fecha a janela se a geração falhar. O usuário pode escolher Salvar como PDF no navegador. O logo carregado do app é incorporado quando disponível. Relatórios largos são divididos em grupos de até oito colunas; número/nome se repetem em cada parte. Nenhuma coluna é descartada.

## Verificação

- 40 testes Node: transformações, combinações de filtros, intervalos, nomes históricos, referências externas, zeros, CSV, partes do PDF e paginação/escopo da fazenda; inclui regressão de cadastro, planos e métricas de peso.
- `tests/animal-reports-browser.cjs`: app real com API simulada, downloads CSV, filtros, nomes de baixados, relatórios novos, PDF agrupado de três páginas, layout desktop/celular, bloqueio do Essencial e textos da página inicial.
- Regressão Chromium de cadastro de animais e contratação/admin/planos.
- PDF de teste renderizado e revisado visualmente, com logo, metadados, tabelas e identificação repetida.

Nenhuma compra real, mensagem externa ou alteração em dados de clientes foi realizada para validar esta entrega.
