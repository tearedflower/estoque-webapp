# Estoque Webapp

Sistema web com foco em gerenciamento operacional de estoque, possui ferramentas para dar movimentações, ordens de serviço, motores, Controle de EPIs, destinos e fechamento mensal.

O projeto usa um frontend em Vue 3 com Vite e uma API Express com SQLite. O foco é uso interno/industrial: cadastro de materiais, busca por hierarquia, entradas, saídas, histórico, controle por destino e gestão de OS.

## Tecnologias

- Vue 3
- Vite
- Tailwind CSS
- Express
- SQLite com `better-sqlite3`
- Autenticação por sessão com cookie `httpOnly`

## Bancos separados

O projeto usa arquivos `.env` para separar banco de desenvolvimento e produção.

- `.env.dev`: banco de desenvolvimento, API na porta 3001.
- `.env.prod`: banco de produção, servidor na porta 3000.
- `.env.example`: modelo versionado.

Scripts úteis:

```powershell
# Popular banco dev com seed
npm run db:seed:dev

# Limpar banco dev
npm run db:reset:dev

# Produção exige confirmação explícita e cria backup antes de apagar
npm run db:reset:prod -- --confirm=APAGAR_PRODUCAO

# Enviar pessoas e cargos cadastrados no DEV para o PROD
npm run prod:promote-people -- --confirm=ENVIAR_PESSOAS_CARGOS_PARA_PROD
```

## Instalação

```powershell
git clone https://github.com/tearedflower/estoque-webapp.git
cd estoque-webapp
npm install
```

O primeiro `npm run dev` cria `.env.dev` automaticamente a partir do exemplo. Para produção, crie e revise o arquivo explicitamente:

```powershell
copy .env.example .env.prod
```

Ajuste `DB_PATH` em cada arquivo para apontar para bancos diferentes.

## Rodando o sistema

### Desenvolvimento

```powershell
# API com reinício automático + frontend Vite
npm run dev
```

Acesse:

```text
http://localhost:5173
```

O frontend de desenvolvimento encaminha as chamadas para a API na porta 3001. O acesso direto em `http://localhost:3001` também utiliza o banco DEV, servindo a última compilação disponível. Produção fica em `http://localhost:3000`.

### Desenvolvimento + produção local

```powershell
npm run server
```

Esse comando inicia DEV e PROD juntos. Na primeira execução, os arquivos `.env.dev` e `.env.prod` são criados automaticamente a partir de `.env.example`, usando bancos e pastas de fotos separados. Pressione `r` e Enter para reiniciar os dois servidores.

### Produção/local estável

```powershell
npm start
```

`npm start` faz o build e inicia o servidor usando `.env.prod`. `npm run start:prod` é um alias explícito do mesmo comando.

### Verificação local

```powershell
npm test
npm run smoke:local
```

O smoke test sobe uma API isolada, verifica saúde, autenticação, proteção de escrita, criação de item, variação e movimentação de estoque.

O estado básico do servidor também pode ser consultado em:

```text
GET /api/health
```

### Importar a planilha do almoxarifado

A importação reutiliza as associações salvas, preserva os ajustes manuais e cria backup antes de gravar.
Datas do Excel sem horário são interpretadas como dias de São Paulo. Quantidade positiva, data e nome
do produto são obrigatórios; linhas incompletas ficam no relatório, sem inventar produtos ou saldos.

```powershell
# Simular no banco escolhido e gerar relatório, sem confirmar as mudanças
npm run import:workbook -- --env=.env.dev --file="C:\caminho\Controle de Estoque - Almoxarifado.xlsm" --report="server/backups/previa.json"

# Aplicar após a conferência. --update-existing permite corrigir linhas já importadas.
npm run import:workbook -- --env=.env.dev --file="C:\caminho\Controle de Estoque - Almoxarifado.xlsm" --apply --update-existing --report="server/backups/importacao.json"
```

Produtos sem associação exigem cadastro/associação pela interface ou um plano JSON fornecido por
`--catalog=caminho.json`. O plano contém `sourceName`, `itemId` e `values`; para um novo modelo,
substitua `itemId` por `name`, `group`, `category`, `subcategory` e `unit`. `extras` é opcional.
`remap: true` corrige uma associação existente após revisão. A gravação do catálogo e das
movimentações ocorre na mesma transação. Uma repetição sem mudanças não duplica os registros.

A identidade histórica usa aba e número da linha da planilha única do almoxarifado. Linhas alteradas
são bloqueadas por padrão; habilite a atualização somente após conferir a versão da planilha.
Linhas removidas do arquivo não apagam o histórico já gravado. Arquivos independentes exigem
uma identificação de origem própria antes de usar este importador.

### Inicialização automática no Windows

Com o `.env.prod` configurado:

```powershell
npm run windows:install
```

Isso cria a tarefa `Estoque Webapp` no Agendador de Tarefas para iniciar no logon. O log fica em `logs/estoque-server.log`.

Para remover:

```powershell
npm run windows:uninstall
```

### Backup e restauração

Os backups automáticos ficam em `server/backups` por padrão. Para restaurar, primeiro pare o servidor e execute:

```powershell
npm run backup:restore -- --env=.env.prod --file="server/backups/estoque-AAAA-MM-DD.db" --confirm=RESTAURAR_BACKUP
```

Antes da troca, o comando valida o backup e preserva uma cópia do banco atual na pasta de backups.

O servidor também agenda backups locais, aplica retenção horária, diária e mensal e verifica cada arquivo por restauração de teste. As opções principais ficam no `.env`:

```text
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_KEEP_HOURLY=24
BACKUP_KEEP_DAILY=30
BACKUP_KEEP_MONTHLY=12
BACKUP_MIRROR_DIR=
```

`BACKUP_MIRROR_DIR` é opcional e permite copiar os backups verificados para outro diretório. A interface mostra o estado e a previsão do próximo backup.

Os novos backups são um par: `estoque-....db` e a pasta irmã `estoque-....db.photos`.
A pasta contém as fotos dos lotes referenciadas pelo banco e um manifesto com SHA-256;
as fotos permanentes do catálogo já ficam dentro do SQLite. Copie e mantenha o par junto.
O espelho inclui os dois, e a retenção local remove os dois. Uma imagem referenciada
ausente impede que o backup seja considerado concluído.

Com o servidor parado, `backup:restore` verifica as imagens antes de substituir os dados
e restaura o par. A cópia de segurança do banco atual fica em `antes-restauracao-....db`;
as imagens anteriores, quando presentes, ficam na pasta `.photos-original` ao lado dessa cópia.
Backups antigos sem `.photos` continuam aceitos, mas restauram somente o banco e mantêm
as imagens atuais; o comando informa essa limitação. Não remova pastas `.restore.old`
ou `.restore.tmp` após uma interrupção sem conferir seu conteúdo.

### Auditoria e concorrência

A aba **Administração → Auditoria** centraliza os registros de movimentações para administradores.
Ela oferece busca por material, operador, documento ou motivo, filtros por ação e período,
paginação e detalhes dos valores anteriores e atuais. O histórico operacional mantém
as ações de editar e excluir; a consulta da auditoria fica na Administração.
O endereço direto é `/#/cadastros?subTab=auditoria`.
Correções e exclusões guardam o conteúdo anterior, o novo conteúdo quando aplicável,
o operador, o horário e o motivo. A remoção de materiais de OS também registra a
movimentação removida. Correções de quantidade ou data e exclusões recalculam os saldos
históricos restantes da variação na mesma transação.

A auditoria começa na migração de esquema 9: ela não recupera alterações anteriores.
O modelo continua permitindo correção e exclusão administrativa com auditoria; ainda
não exige estorno como único método de correção. Importações e mudanças em cadastros
têm suas regras próprias e ainda não estão integralmente cobertas pela nova auditoria.

A API de edição aceita `expectedRevision`, obtida na consulta da movimentação.
Uma revisão desatualizada retorna `409 MOVEMENT_CHANGED`. O formulário envia a revisão
com que foi aberto para evitar sobrepor a edição de outra sessão.

Entradas, saídas, lotes e inclusão de materiais em OS aceitam o cabeçalho
`Idempotency-Key` (8 a 160 caracteres: letras, números, `_` e `-`). Pedidos repetidos
do mesmo usuário, para a mesma rota e com o mesmo corpo retornam a resposta gravada,
sem movimentar novamente. Reutilizar a chave com outro corpo retorna `409`.
O cliente repete uma falha de rede uma vez, usando a mesma chave. Respostas de erro
não são memorizadas. O campo `requestId` dos lotes continua compatível.

### Carregamento e consulta do histórico

As telas reaproveitam dados durante 30 segundos e compartilham pedidos simultâneos.
Trocar de aba carrega os recursos daquela tela; alterações locais invalidam o cache,
e voltar à janela verifica os recursos da tela atual. A carga inicial ainda alimenta
a busca global e os relatórios.

`GET /api/movements?page=1&pageSize=50` retorna `{ items, total, page, pageSize }`.
`pageSize` permite de 1 a 200; os filtros opcionais são `variationId`, `type`, `from`
e `to` (datas ISO, limites inclusivos). Sem paginação, a resposta continua sendo um array.
Há índices por data e por variação/data. O histórico e os relatórios do frontend ainda
usam a consulta completa: migrá-los para paginação e agregações remotas é uma etapa posterior.

A nova aba de Auditoria já usa paginação no servidor:
`GET /api/movements/audit?page=1&pageSize=25`. Ela aceita `q` (busca sem distinguir
acentos ou maiúsculas), `action` (`update`, `delete` ou `recalculate`), `from`
(instante inicial inclusivo) e `to` (instante final exclusivo). O formulário inclui
o dia final inteiro no fuso local do navegador. `pageSize` permite de 1 a 100;
a resposta contém `{ items, total, page, pageSize }`. Esse endpoint exige administrador.

A lista de pessoas exige autenticação e papel de administrador ou operador.
Trocar a própria senha encerra as outras sessões; redefinir a senha de outra conta
ou desativá-la encerra as sessões daquela conta. A sessão atual continua após a troca
da própria senha.

### Testes no navegador

```sh
npx playwright install chromium
npm run test:e2e
```

Os testes iniciam frontend e API próprios nas portas 5174 e 3101, com banco e imagens
temporários. Não reutilizam o servidor nem o banco instalados. Cobrem navegação pública,
cache entre telas, login, troca de senha inicial, correção concorrente e auditoria de
correções/exclusões na Administração, filtros e navegação entre páginas. `npm test` também compila todos os componentes Vue em modo dev.
O workflow de CI executa testes, build e testes no navegador em Node 24.

### Acesso pela rede

O servidor aceita a própria origem e acessos locais. Se o frontend e a API usarem origens diferentes na rede, liste-as separadas por vírgula:

```text
CORS_ORIGINS=http://192.168.0.20:5173,http://estoque.local
```

As tentativas de login são limitadas, respostas recebem cabeçalhos de segurança e requisições da API geram logs estruturados.

## Autenticação e permissões

- Usuário não logado pode visualizar áreas públicas.
- Usuário não logado não pode criar, editar, excluir, movimentar, ajustar estoque ou fechar período.
- Login usa sessão persistente por cookie `httpOnly`.
- Admin pode criar operadores.
- Admin mestre pode alterar senha de qualquer usuário.
- Usuário logado pode alterar a própria senha.
- Admin comum não pode excluir outro admin.

Primeiro acesso em banco novo:

```text
admin / admin123
```

O sistema exige a troca de `admin123` antes de liberar ações protegidas.

## Funcionalidades principais

- Dashboard operacional com alertas e atalhos.
- Catálogo por grupos, categorias, subcategorias, itens e variações.
- Cadastro e edição de hierarquia, incluindo adicionar, renomear e excluir atributos dos modelos.
- Inventário com tabela, filtros, estoque mínimo, ajustes e ficha operacional da variação.
- Entrada e saída de materiais com lote de movimentações e sugestão editável baseada na última movimentação relevante.
- Importação administrativa de planilhas `.xlsx`/`.xlsm`, com associação por nome, cadastro inativo de ex-funcionários, recálculo do saldo pelo histórico e importação da quantidade mínima de `CADASTROS`, distinguindo vazio de zero.
- Histórico de movimentações com busca única e filtros.
- Resumo por destino em blocos hierárquicos.
- Fechamento mensal com prévia, revisão de inconsistências, substituição controlada e exportação CSV.
- Ordens de serviço comuns e ordens de serviço de motor.
- Exportação CSV de OS individual, filtrada ou completa.
- Motores com eventos, histórico, OS vinculadas e materiais previstos/usados.
- Cadastros auxiliares: pessoas, cargos, destinos, locais, fornecedores, usuários e EPIs.
- Controle de EPIs por cargo, periodicidade e pessoa, com filtros de situação e registro de entregas em lote.
- Histórico de retiradas de EPI com edição administrativa e recálculo do estoque.
- Backup local agendado, verificado e com retenção configurável.
- Atalhos de teclado e popup de ajuda com `?`.

## Seed e ferramentas de teste

Botões de `Popular` e `Limpar` aparecem somente quando:

```text
VITE_ENABLE_SEED_TOOLS=true
```

Isso deve ficar ligado no ambiente dev e desligado em produção.

As rotas destrutivas também são bloqueadas pelo servidor fora de `.env.dev`; esconder os botões não é a única proteção.

A exibição desses botões depende do `.env` usado no build, independentemente da branch.

O seed operacional inclui pessoas, cargos, hierarquia, variações, fornecedores, movimentações, estoque, situações de EPI, ordens de serviço, motores, fechamentos e auditorias com referências e saldos consistentes.

## Estrutura

```text
server/
  index.js                  API Express
  db.js                     schema SQLite, migrações e conexão
  backup.js                 rotina de backup
  middleware/
    auth.js                 proteção por sessão/role
  routes/
    auth.js                 login, logout e usuários
    items.js                itens e variações
    movements.js            entradas, saídas e histórico
    destinations.js         destinos
    locations.js            locais
    people.js               pessoas
    suppliers.js            fornecedores
    roles.js                cargos
    epis.js                 EPIs
    motors.js               motores
    workOrders.js           ordens de serviço
    closings.js             fechamento
    seed.js                 seed e ordem de exibição
  scripts/
    start.js                start por ambiente
    seedDatabase.js         seed/reset por ambiente

src/
  App.vue                   layout principal e navegação
  main.js                   entrada Vue
  style.css                 tema e estilos globais
  services/
    api.js                  cliente HTTP
  composables/              estados e regras por domínio
  components/
    ui/                     componentes comuns
    cadastros/              abas de cadastros
    inventario/             abas e painéis do inventário
    movements/              painéis de movimentações
  views/
    DashboardView.vue
    CatalogView.vue
    EditHierarchyView.vue
    InventarioView.vue
    MovimentacoesView.vue
    OrdensServicoView.vue
    MotoresView.vue
    CadastrosView.vue
```

## Conferência na primeira movimentação

A partir da ativação em 30/09/2026, cada variação exige uma contagem física **antes** da primeira nova movimentação, mesmo que já tenha histórico importado. A confirmação fica gravada no banco e não é repetida nos próximos dias nem após reiniciar o sistema.

Ao confirmar, o sistema registra a diferença como uma entrada ou saída com a referência `CONFERÊNCIA INICIAL`, preserva o operador e salva o ajuste junto da movimentação em uma única transação. Contagem igual ao saldo (inclusive zero) também marca a variação como conferida, sem criar movimento de quantidade zero. Cancelar ou falhar a gravação não altera o saldo nem conclui a conferência.

A regra abrange movimentação individual, lote rápido, fotos, entregas de EPI e materiais adicionados por ordem de serviço. No lote, cada variação é contada uma vez antes de todas as suas linhas. Novos produtos cadastrados por foto também exigem contagem explícita. Importação de histórico não confirma estoque físico. Um saldo antigo zero ou negativo não bloqueia o acesso à conferência; depois dela, saídas continuam limitadas à quantidade disponível.

Os ajustes de conferência são registros de auditoria e não podem ser editados ou excluídos. Correções posteriores devem ser feitas por novo ajuste. O registro da contagem fica em `stock_confirmations`, com saldo anterior, quantidade contada, data e operador. A migração cria backup antes de atualizar um banco existente.

## Scripts

```powershell
npm run dev             # API com watch + Vite em modo dev
npm run build           # build frontend
npm start               # build + servidor usando .env.prod
npm run start:prod      # alias explícito de produção
npm run smoke:local     # fluxo integrado da API em banco temporário
npm run backup:restore -- --env=.env.prod --file=CAMINHO --confirm=RESTAURAR_BACKUP
npm run windows:install # inicia automaticamente no logon do Windows
npm run windows:uninstall
npm run prod:promote-people -- --confirm=ENVIAR_PESSOAS_CARGOS_PARA_PROD  # copia/atualiza pessoas e cargos do dev para prod
npm run db:seed:dev     # popula banco dev com seed
npm run db:reset:dev    # limpa banco dev
npm run db:reset:prod -- --confirm=APAGAR_PRODUCAO  # backup + reset protegido
npm test                # testes node:test
```
