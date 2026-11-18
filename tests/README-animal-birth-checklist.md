# Checklist de nascimento no cadastro do animal

Animais → Novo animal → categoria Bezerro ou Bezerra. Abaixo da data de nascimento, aparecem os cuidados opcionais: colostro, umbigo, identificação e peso. Nada é marcado automaticamente. O produtor pode atualizar pela edição e consultar o progresso na ficha.

O campo `animals.birth_checklist` aceita apenas os quatro itens booleanos. Clientes antigos que não enviam esse campo preservam o histórico. A mudança de categoria ao crescer preserva os cuidados já registrados. O checklist é individual e não altera o checklist pós-parto da matriz.

As políticas de isolamento e de acesso do animal também protegem o campo novo. Nenhum dado de clientes é alterado pela migração; animais anteriores começam sem checklist.

Verificação: `node --test tests/animal-birth-checklist.test.cjs tests/plans.test.cjs`; `tests/animal-birth-checklist-rls.sql` usa registros temporários e rollback para testar persistência, edição, validação, crescimento e isolamento entre usuários. A interface não foi conferida visualmente nesta alteração.
