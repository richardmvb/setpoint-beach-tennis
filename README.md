# SETPOINT

**Organize torneios de beach tennis, acompanhe cada rodada e compartilhe o resultado.**

SETPOINT é um gerenciador de torneios para uso no clube ou na quadra. Monte a tabela, registre placares, acompanhe a classificação individual e conduza finais e pódio em um único fluxo.

## Funcionalidades

- **Super:** 8, 10, 12 ou 24 atletas, com parceiros rotativos.
- **Grupos:** 8, 12 ou 24 atletas, com parceiros rotativos ou duplas fixas.
- **Duplas abertas ou mistas:** no modo misto, cada dupla tem um atleta masculino e um feminino.
- **Sorteio a cada tabela:** a ordem de cadastro não define nada. Duplas, grupos, ordem das rodadas e quadras são sorteados a cada geração; as quadras se alternam para ninguém ficar sempre na mesma, os descansos ficam espaçados (evitando descansar em rodadas seguidas) e as regras de cada formato continuam garantidas.
- **Seu perfil:** nome, foto e categoria do organizador, guardados só no aparelho. No primeiro acesso, ao sair da landing page, o perfil abre uma única vez para ser preenchido (dá para pular com "Agora não"; depois fica no botão do cabeçalho). O perfil preenche os campos de nome nos convites e, se a opção estiver ligada, inclui você como jogador nos novos torneios locais.
- **Configuração por faixas:** participantes, quadras e games usam controles de faixa que se adaptam ao formato escolhido.
- **Cadastro em lote:** cole uma lista de atletas, revise nomes e categorias antes de confirmar; o fluxo individual continua disponível.
- **Lançamento de placares por rodada:** navegação entre rodadas, campos numéricos maiores e atualização automática do ranking.
- **Classificação e finais:** critérios individuais, desempates, final, disputa de 3º lugar e pódio.
- **Final ponto a ponto:** opcional em qualquer formato, com ponto decisivo em 40–40, tie-break em 6–6 e opção de desfazer o último ponto. A disputa de 3º continua com placar manual.
- **Super 24 misto em 3 quadras:** 12 homens e 12 mulheres em baterias equilibradas, com ranking separado por categoria e encerramento antecipado opcional.
- **Seu caminho (projeção):** em torneios compartilhados Super, cada atleta vê a chance real de ser campeão, chegar ao top 2 ou ao top 3, calculada sobre todos os cenários possíveis dos jogos que faltam (parceiros e adversários acoplados, como na tabela real).
  - Mostra a chance por objetivo, onde o atleta pode terminar, a evolução da chance rodada a rodada e quanto vale cada vitória.
  - Destaca os jogos que mais mexem na chance (os dele e os dos outros) e os rivais a acompanhar, com o ganho em pontos percentuais.
  - **E se?:** toque em um jogo para assumir o resultado e ver a chance se recalcular.
  - Diz "garantido" ou "fora da disputa" somente quando é matematicamente certo. Até 18 jogos em aberto o cálculo é exato; acima disso é uma simulação reproduzível.
  - Avisa o atleta quando um resultado muda sua chance em 5 pontos ou mais (com confete ao garantir o objetivo) e gera uma imagem para compartilhar.
  - Premissas exibidas na tela: jogos restantes equilibrados (50/50) e empates em vitórias decididos pelo saldo de games e depois pelo confronto direto. Disponível apenas em torneios compartilhados Super.
- **Convites compartilhados:** guests entram pelo link; o moderador pode incluir participantes sem celular.
- **Fotos opcionais:** avatars WebP são reduzidos localmente para até 8 kB e mantêm as iniciais como fallback.
- **Card para Instagram:** prévia antes de exportar, três layouts e foto de fundo opcional processada no navegador.
- **Relatório final:** em Ajustes após finalizar, gere uma imagem PNG, compartilhe ou copie o texto e crie um link de resultado somente leitura.
- **NPS:** pesquisa configurada no PostHog, disponível no footer e em momentos de conclusão do torneio.
- **Dashboard de produto** (`/dashboard`, só administradores), em três abas:
  - **Resumo:** indicadores do período (7, 30 ou 90 dias) comparados ao período anterior, com minigráficos; insights em linguagem simples ("Uso cresceu 35%", "Maior parada: antes do primeiro placar", "Pico de uso: sábados às 19h"); tendência diária e funil do início ao pódio.
  - **Uso e recursos:** mix de formatos, conclusão por formato, mapa de calor de quando os torneios começam, adoção de recursos (ao vivo, Seu caminho, final ponto a ponto, finais antecipadas, duplas mistas e fixas), retenção de moderadores e funil de inscrição dos compartilhados.
  - **Torneios:** listas em andamento e arquivados, onde os torneios pararam e os contadores brutos.
  - O que é medido no banco e no PostHog está em [`docs/analytics.md`](docs/analytics.md), com o catálogo de eventos e sugestões de funis.
- **Meus torneios:** todo torneio iniciado fica salvo no dispositivo (até 30). Reabra qualquer um para rever tabela, placares, ranking e pódio, mesmo depois de iniciar outro ou de uma nova versão do app.
- **Cópia completa na nuvem:** com o Supabase configurado, cada torneio local iniciado é arquivado com todos os detalhes (participantes, rodadas, placares e finais) para ser recuperado e revisitado no dashboard.
- **Configuração guiada:** assistente em três etapas com opções em cartões, resumo ao vivo do formato, barra de vagas, etapas clicáveis e tutorial interativo (driver.js) para cada etapa.
- **Confirmações elegantes:** diálogos com SweetAlert2 no mesmo visual do app (folha inferior no celular). Finalizar o torneio exige digitar `finalizar`.
- **Landing page:** apresentação do produto, formatos, acompanhamento ao vivo, uma seção dedicada ao "Seu caminho" (com a ressalva de que vale para torneios compartilhados) e atalho para retomar torneios salvos.
- **Modo claro e escuro**, backups JSON e versão no cabeçalho e rodapé.

## Formatos

| Formato                  |            Rodadas |          Quadras | Observações                                                                                  |
| ------------------------ | -----------------: | ---------------: | -------------------------------------------------------------------------------------------- |
| Super 8                  |                  7 |                2 | Todos enfrentam os demais; parceiros não se repetem no formato aberto.                       |
| Super 10                 |                 10 |                2 | Descansos distribuídos para equilibrar partidas.                                             |
| Super 12                 |                 11 |                3 | Todos jogam 8 partidas.                                                                      |
| Super 12                 |                 12 |                2 | Rodada de equalização de jogos e descansos.                                                  |
| Super 24 aberto          |                 23 |                6 | Todos jogam em cada rodada.                                                                  |
| Super 24 misto           |                 12 |                6 | Cada atleta joga 12 partidas, uma com cada parceiro da outra categoria.                      |
| Super 24 misto           |                 24 |                3 | Cada dupla de rodadas equaliza os jogos; permite encerrar a classificatória antecipadamente. |
| Grupos rotativos abertos |                  3 |      1 por grupo | Grupos de quatro; cada atleta forma parceria com os outros três.                             |
| Grupos rotativos mistos  |                  2 |      1 por grupo | Grupos de quatro balanceados com dois atletas de cada categoria.                             |
| Grupos fixos             | Todos contra todos | Conforme formato | Duplas definidas antes de iniciar.                                                           |

Em todos os formatos, a cada tabela gerada os atletas são sorteados (inclusive a composição dos grupos rotativos), a ordem das rodadas é embaralhada e as quadras são distribuídas para que cada atleta passe pelas diferentes quadras. No Super 24 misto em 3 quadras, as duas metades de cada rodada completa continuam juntas, preservando os pontos em que todos têm o mesmo número de partidas (necessários para as finais antecipadas). Nos grupos, o número de quadras continua sendo um por grupo, mas um grupo não fica preso à mesma quadra.

No Super 24 misto, as novas tabelas garantem 12 jogos por atleta, sem repetir parceiros nem o mesmo grupo de quatro jogadores. O gerador busca diversificar os confrontos, mas não garante que todos os atletas se enfrentem. Tabelas já geradas permanecem inalteradas.

A final é disputada em um único set. No modo ponto a ponto, os espectadores acompanham games e pontos pelo link compartilhado ou ao vivo; alterações feitas offline aparecem após a sincronização.

Em finais antecipadas, o relatório final e a visualização final pelo link incluem apenas partidas com placar registrado. A imagem pode ser baixada ou compartilhada; o texto pode ser enviado pelo seletor de compartilhamento ou copiado para o WhatsApp. O link final mostra um snapshot sem atualização em tempo real: um link local existente é reutilizado quando já contém o resultado final; caso contrário, um novo snapshot é publicado. Gerar o link requer conexão e Supabase configurado.

### Finais antecipadas no Super 24 misto

Ao escolher **Super 24**, **duplas mistas**, **3 quadras** e ativar a opção de finais antecipadas, o moderador pode gerar a fase final quando todos tiverem a mesma quantidade de partidas registradas. O ranking passa a exibir tabelas masculina e feminina. É possível escolher entre:

- **Chave completa:** os oito melhores homens e as oito melhores mulheres formam oito duplas fixas para quartas, semifinais, final e disputa de 3º.
- **Final direta:** os quatro melhores de cada categoria formam quatro duplas para final e disputa de 3º.

## Começar localmente

### Requisitos

- Node.js 20.19+, 22.12+ ou 24+
- npm 10+

### Instalação

```bash
npm ci
npm start
```

Abra `http://localhost:4200`. O assistente começa em **Preparar** e só libera as outras áreas depois que a tabela é gerada.

Para validar a publicação:

```bash
npm run build -- --base-href /setpoint-beach-tennis/
```

Os arquivos de produção são gerados em `dist/setpoint/browser`. Rode os testes com `npm test`. O mapa das máquinas de estado do app está em [`docs/state-machines.md`](docs/state-machines.md).

## Desenvolvimento

Para contribuir, veja [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês). As regras do projeto para pessoas e agentes de IA estão em [CLAUDE.md](CLAUDE.md). Comandos principais:

```bash
npm run lint         # ESLint (TypeScript e templates)
npm run lint:styles  # Stylelint
npm run format:check # Prettier
npm run typecheck    # TypeScript
npm run knip         # código e dependências não usados
npm test             # testes unitários
npm run test:db      # testes SQL (PGlite)
npm run check        # todos os itens acima e o build de produção
```

## Modo local

O torneio completo fica no `localStorage` do navegador. Todo torneio iniciado também é guardado em **Meus torneios** (botão no cabeçalho, na configuração e em Ajustes): até 30 torneios, mesmo depois de iniciar outro ou de uma nova versão do app. Abra qualquer um para rever tabela, placares e ranking; torneios finalizados abrem somente para leitura. As fotos não são guardadas no histórico. Não é necessário Supabase para montar tabelas, lançar resultados, gerar finais ou usar os backups. Com o Supabase configurado, a tela Ajustes também permite gerar um link público de acompanhamento para torneios locais, inclusive em andamento. Esse link só permite visualizar participantes, partidas e placares; não permite entrar nem editar. As fotos dos participantes não são publicadas nesse espelho.

Quando o Supabase estiver configurado e o login anônimo habilitado, o SETPOINT envia métricas agregadas dos torneios locais (sem nomes, fotos ou placares) e uma cópia completa de cada torneio iniciado — participantes, rodadas, placares e finais, sem fotos — para que administradores possam recuperá-lo e revisitá-lo no dashboard. Se a conexão ou autenticação não estiver disponível, o uso local continua funcionando: o envio fica pendente e é repetido ao reconectar, ao abrir o app e a cada alteração.

## Modo compartilhado

O Supabase guarda o estado do torneio e sincroniza participantes, rodadas e resultados entre moderador e guests. O moderador entra sem e-mail por autenticação anônima; guests usam o convite e não precisam criar conta. O moderador ocupa uma vaga, inicia o torneio e registra os placares. Convites incompletos expiram em 15 minutos. Um job no Supabase verifica a cada cinco minutos os torneios compartilhados e lives locais e arquiva os que estão há pelo menos 24 horas sem atualização no servidor. Nos compartilhados ativos, cada atualização renova o prazo de expiração.

Depois que um torneio compartilhado é iniciado e carregado no dispositivo do moderador, os placares podem ser registrados sem conexão. As alterações ficam no navegador e são enviadas em ordem ao reconectar. Em Ajustes é possível pausar a sincronização automática ou enviar manualmente; o status no cabeçalho indica a situação. O mesmo vale para a atualização do link ao vivo de um torneio local. Os espectadores só recebem os novos resultados depois da sincronização.

Abrir o aplicativo pela primeira vez, criar ou iniciar torneios compartilhados e inscrever convidados exige conexão. O carregamento da página após fechá-la ou recarregá-la sem internet depende do cache do navegador; não há garantia de acesso offline completo. Use uma única aba e dispositivo para moderar cada torneio. O worker não consegue detectar alterações ainda não sincronizadas: após 24 horas sem atualização no servidor, ele pode arquivar o torneio mesmo que existam placares offline no dispositivo. Se o servidor tiver sido alterado por outro dispositivo, ou o torneio tiver expirado ou sido arquivado, a sincronização é bloqueada para preservar os dados locais; os dados não são mesclados automaticamente. Exporte um backup antes de reiniciar ou substituir o torneio. Não limpe os dados do navegador enquanto houver alterações pendentes.

### Configuração do Supabase

1. Aplique uma vez, nesta ordem, as migrations pendentes pelo SQL Editor do projeto:
   - `202610310001_shared_tournaments.sql`
   - `202611010001_moderator_manual_participants.sql`
   - `202611010002_cancel_shared_tournament.sql`
   - `202611010003_archive_dashboard_metrics.sql`
   - `202611010004_local_tournament_metrics.sql`
   - `202611010005_super24_mixed_doubles.sql`
   - `202611010006_shared_player_avatars.sql`
   - `202611070001_local_metrics_super24_three_courts.sql`
   - `202611070002_local_live_spectator_links.sql`
   - `202611080001_dashboard_activity.sql`
   - `202611080002_offline_sync.sql`
   - `202611080003_archive_inactive_tournaments.sql`
   - `202611090001_local_tournament_archives.sql`
   - `202611090002_dashboard_insights.sql`
     Aplique as migrations antes de publicar a nova versão do app, para que os envios ao vivo não fiquem pendentes por falta das RPCs.
2. Em **Authentication → URL Configuration**, configure o Site URL e permita os redirects usados, incluindo:
   - `https://richardmvb.github.io/setpoint-beach-tennis/dashboard`
   - `http://localhost:4200/dashboard`
   - `http://localhost:4201/dashboard`, se usar essa porta local.
3. Habilite **Allow anonymous sign-ins** para o moderador sem e-mail, métricas locais e publicação de links de acompanhamento.
4. Para o dashboard, use o magic link com uma conta autorizada em `public.setpoint_dashboard_admins`. A RPC verifica a sessão e a allowlist no banco.

O dashboard lê métricas e, somente para administradores autorizados, estados de torneios compartilhados, locais publicados ao vivo e cópias completas de torneios locais (arquivadas em `local_tournament_archives`, sem expiração). Fotos compartilhadas são thumbnails WebP em Base64, limitadas pelo app e validadas no servidor. Elas ficam no estado privado do torneio compartilhado, sem bucket público.

### Configuração do deploy

Em **GitHub → Settings → Secrets and variables → Actions → Variables**, configure:

- `SUPABASE_URL`: Project URL do Supabase, sem `/rest/v1/`.
- `SUPABASE_PUBLISHABLE_KEY`: chave publicável do projeto.
- `NG_APP_POSTHOG_PROJECT_TOKEN`: project token do PostHog.
- `NG_APP_POSTHOG_HOST`: host PostHog da região do projeto.
- `NG_APP_LOCK_SCREEN_ENABLED`: opcional; use `true` para ativar a tela de desbloqueio do torneio. Ausente ou `false`, a tela fica desativada.

O workflow gera `runtime-config.js`, compila o Angular e publica no GitHub Pages. A versão exibida é a quantidade de commits alcançáveis a partir do commit publicado; em desenvolvimento, sem essa configuração, aparece `dev`. O fallback do Pages permite carregar `/dashboard` diretamente. Use apenas chaves publicáveis no frontend; nunca coloque `service_role` no código ou nas variáveis do build.

## Métricas

O PostHog acompanha eventos de criação e início de torneios, etapas do assistente, navegação, placares, finais, compartilhamentos e conclusão. O campo `doubles_format` diferencia torneios abertos e mistos; categorias e fotos individuais não são enviadas ao PostHog.

O Dashboard agrega torneios locais e compartilhados, incluindo Super 24, grupos, duplas mistas, abandonos, participantes, taxa de conclusão, funil, retenção e adoção de recursos (RPC `get_dashboard_insights`; sem a migration `202611090002`, as abas novas avisam e o restante continua funcionando). A tabela `setpoint_dashboard_admins` controla quem pode consultar os dados. A lista em andamento inclui torneios compartilhados e locais com link ao vivo; a data indica a última atualização recebida e não garante que o organizador ainda esteja conectado. Torneios locais sem link ao vivo não têm estado disponível no servidor.

Torneios compartilhados e lives locais arquivados podem ser consultados em uma nova aba e exportados em JSON para importação como torneio local. O arquivo não reativa o torneio ou convite original. O arquivamento por inatividade fecha o registro sem inventar placares, pódio ou conclusão esportiva. O detalhamento de abandono agrupa compartilhados arquivados sem finalizar pela etapa atingida e contabiliza locais reiniciados como etapa desconhecida. Torneios locais nunca publicados não têm estado no servidor e não são arquivados pelo job. Fechar a página sem reiniciar ou arquivar não é detectado como abandono.

## Ranking e integridade

O ranking considera sets ganhos, saldo de games e games pró. Empates podem exigir confronto direto ou sorteio antes da geração das finais. Descansos não concedem nem retiram pontos.

O gerador combina validações com busca heurística e aleatoriedade para distribuir confrontos e descansos. Depois de montar as rodadas, ele só reordena as rodadas e troca as quadras; os jogos de cada rodada não mudam, e a tabela final passa de novo pela validação completa. Ele verifica os invariantes do formato, mas não garante uma otimização matemática global (o equilíbrio de quadras e a separação de descansos são os melhores encontrados, não perfeitos). Revise a tabela gerada antes do início.

## Privacidade e segurança

- O perfil (nome, foto, categoria) fica apenas no `localStorage` do aparelho e nunca é enviado sozinho. Ele só sai do aparelho quando você entra como jogador em um torneio, e então segue as mesmas regras dos demais participantes daquele torneio.
- Dados coletados: apenas nomes digitados, categorias (em duplas mistas), partidas e placares. Não há coleta de telefone, e-mail, documento ou outros dados pessoais dos atletas; o e-mail só é usado por administradores para entrar no dashboard.
- Torneios locais ficam no dispositivo e em **Meus torneios**; iniciar outro torneio remove o estado ativo e os caches de sincronização, mas mantém o histórico (exclua pelo próprio Meus torneios). A cópia enviada à nuvem não inclui fotos.
- Torneios compartilhados e participantes cancelados/expirados são arquivados para preservar métricas e histórico.
- Os tokens de convite são armazenados como hash no banco.
- As RPCs e políticas do Supabase são a autoridade de acesso. Não use `service_role` no navegador.
- Fotos são opcionais, comprimidas no dispositivo e enviadas somente no modo compartilhado para aparecer nos avatares do torneio.
