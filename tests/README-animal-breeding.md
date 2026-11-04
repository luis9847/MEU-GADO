# Registro e filiação — primeira etapa

Campos opcionais na criação/edição do animal: associação, série, RGN, RGD e categoria do registro; função reprodutiva e condição do macho; pai e mãe do próprio rebanho ou referências externas (nome/registro). A categoria Touro tem filtro próprio. A ficha apresenta registro, classificação, pai/mãe e descendentes cadastrados pelos dois lados. Os números da associação participam da busca.

O número do animal continua único por fazenda. Ascendentes externos são campos de referência, não animais ativos; não entram na contagem comercial. Não há validação/comunicação automática com associações, cálculo de DEPs, árvore de múltiplas gerações, anexos ou controle de sêmen/embriões nesta etapa.

As alterações são aditivas, com campos inicialmente nulos. Payloads de clientes antigos só alteram os novos campos se as propriedades estiverem presentes. O cadastro simplificado continua válido. Vínculos históricos permanecem ao baixar ou enviar um ascendente para a Lixeira; novos vínculos com a Lixeira são recusados. A lista de ascendentes inclui baixados, usa paginação e cache por conta no fluxo offline existente. Falha ao carregar a lista não apaga vínculos anteriores.

Banco: FK composta (fazenda/animal) nos pais; RLS e autorização comercial existentes; limites de texto e classificação; função privada SECURITY INVOKER protege filiação, sexo e ciclos. O guard de filiação roda depois do guard comercial e serializa mudanças por fazenda com lock transacional. Corrigir o sexo de um animal já ligado como pai/mãe exige revisar seus vínculos. As informações são declaradas pelo criador.

Validação:

- `node --test tests/animal-breeding.test.cjs tests/plans.test.cjs tests/weight-metrics.test.cjs`: 30 testes.
- `CHROMIUM_PATH=/path/to/chromium node tests/animal-name-browser.cjs`: formulários e rotas CRUD do app com transporte simulado, dados opcionais, edição, busca por registro, filiação, descendentes, dados antigos, celular e fila/replay offline. Sem contas ou dados de produção.
- `tests/animal-breeding-rls.sql`: fixtures em transação com rollback no banco real, persistência, limpeza, limites, categoria/sexo/função, castração, ascendentes externos sem aumentar o rebanho, filiação histórica, autorreferência, ciclos e isolamento entre fazendas.
- Advisor de segurança: sem aumento dos avisos existentes após criar a função privada invocadora.

O cache do Modo Campo foi atualizado para incluir os três novos arquivos.

## Atividade do animal

O campo Atividade é selecionado pelo criador: Cria, Recria, Engorda ou Genética, com opção Não informada. A coluna `production_purpose` é opcional e validada no banco. A raça não altera a atividade; cadastros anteriores ficam sem classificação até edição explícita. O valor aparece na ficha e participa da busca. Payloads antigos que omitem a coluna preservam o valor salvo.
