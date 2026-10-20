# Sistema de interface

## Direcao

Interface operacional de estoque: densa, direta e legivel para pessoas com pouca familiaridade com computadores. O foco de cada tela e a proxima acao concreta; controles secundarios nao competem com ela.

Identidade unica: Industrial, em claro e escuro. Tons de oficina e estoque, navegacao grafite e ambar reservado para atencao. Estilos de referencia nao aparecem como preferencias na operacao.

Assinatura do produto: ficha de circulacao que conecta material, saldo, local ou destino, ultima movimentacao e manutencao relacionada.

## Estrutura visual

- Base de espacamento: 4 px.
- Densidade: controles com 8-12 px internos; paineis com 16-20 px.
- Raios: 6 px em controles, 8-12 px em paineis e 12 px em modais.
- Profundidade: bordas e mudancas sutis de superficie; sombras apenas em elementos elevados.
- Tipografia: 14 px no corpo, 11-12 px em metadados, 600 para titulos, selecoes e acoes principais.
- Numeros dinamicos usam algarismos tabulares.

## Hierarquia

1. Visitante ve `Consultar materiais`; operador ve `Registrar movimentacao`; admin ve `Resolver prioridades`.
2. Navegacao e filtros ativos devem ser reconheciveis sem depender apenas de cor.
3. Metadados e tags ficam em superficies discretas, mas sempre legiveis.
4. Relatorios e detalhes avancados permanecem recolhidos ate serem solicitados.

## Contraste e temas

- Nunca combinar `bg-primary-*` com `text-white` assumindo que a escala primaria e escura.
- Usar `--ds-primary-text` sobre fundos primarios; nunca presumir texto branco.
- Estados ativos usam `--ds-active-bg` com `--ds-active-text`.
- Tags de atributos usam `.ds-attribute-tag`: `--ds-tag-bg`, `--ds-tag-border` e `--ds-tag-text`, iguais em todas as telas.
- No Industrial claro: canvas cinza frio, paineis brancos, campos discretos e texto secundario com contraste legivel.
- No Industrial escuro: grafite azulado sem preto puro, superficies proximas, bordas discretas e texto claro sem branco puro.
- Selecao usa ambar suave com texto contrastante; preenchimento solido fica reservado a acoes.
- Cores de aviso em texto usam `--ds-danger`/`--ds-success`; botoes solidos usam `--ds-danger-solid`/`--ds-success-solid` e suas variantes `-hover`.
- Sombras e sobreposicoes usam `--ds-shadow-panel`, `--ds-shadow-control`, `--ds-shadow-pop` e `--ds-overlay`.
- Cores literais ficam na paleta do tema; o preto e branco da ficha de EPI para impressao e uma excecao intencional.
- Texto normal deve atingir contraste WCAG AA; estados interativos nao podem depender apenas da borda.

## Padroes reutilizaveis

- Botoes: `xs/sm` com 36 px, `md` com 40 px, `lg` com 44 px e icone com 40 px; primario reservado a acao principal e perigo solido apenas para confirmacao destrutiva.
- Dialogos: `AppModal` para confirmacoes simples e `AppDialog` para fluxos complexos; ambos usam `<dialog>` nativo, nome acessivel, foco preso, `Esc`, retorno de foco e fechamento pelo backdrop quando nao persistentes.
- Abas: navegacao principal, contexto e controle segmentado sao camadas distintas; segmentado usa recipiente discreto e aba ativa elevada sobre a superficie.
- Tabelas: cabecalho fixo, linhas de 44 px, numeros tabulares, acoes na ultima coluna e rolagem horizontal quando necessario.
- Selecao em listas: fundo ativo, texto contrastante, icone e contador herdando a cor do estado.
- Tag de atributo: compacta, borda discreta, chave com peso 600 e valor com peso regular.
- Filtros laterais: busca no topo, hierarquia progressiva e uma unica selecao evidente.
- Destinos: arvore de profundidade livre com breadcrumb e bloqueio de ciclos; cada filho abre ficha propria e pode receber novos filhos; clique direito abre `Mover`, `Renomear` e `Excluir`.
- Motores: `Consultar motores` navega um nivel por vez em cards, com breadcrumb: destino pai, filhos e por fim motores; clicar no motor abre a ficha existente.
- Todos os acessos de entrada e saida abrem o mesmo fluxo de movimentacao rapida.
- `Ctrl+K`: acoes frequentes primeiro quando vazio; resultados equilibrados por dominio e registros recentes.
- Falha de sincronizacao: aviso persistente com fontes afetadas e acao `Tentar novamente`.
- Fechamento mensal: sempre passa por previa com periodo, movimentos, alertas e indicacao de substituicao.
- Ficha de circulacao: saldo, local, destinos, ultima movimentacao e OS relacionadas; cada OS abre diretamente no modulo de manutencao.

## Movimento

- Acordeoes: wrapper `.ds-collapse` + `.ds-collapse-open` com UM filho direto; grid `0fr/1fr`, 200 ms, `visibility` junto para sair da arvore de acessibilidade quando fechado. Nunca `v-if` no corpo do acordeao.
- Dropdowns/popovers: classe `.ds-pop` no elemento (entrada 150 ms via `@starting-style`, saida instantanea); variante `.ds-pop-up` quando abre para cima.
- Modais: entrada animada no proprio `AppDialog` (fade + subida leve, backdrop 160 ms); saida instantanea por design.
- Toasts: entrada 180 ms, saida 120 ms, apenas `opacity` e `transform`; reordenacao usa 180 ms.
- Botoes: `:active` com `scale(0.97)`.
- Curva padrao `cubic-bezier(0.23, 1, 0.32, 1)`; tudo desligado em `prefers-reduced-motion`.

## Referencias

Referencias externas servem apenas para criterios de acabamento: bordas silenciosas, superficies proximas e estados ativos de contraste forte. A interface final continua industrial e nao copia identidades de outros produtos.
