# SETPOINT

**Organize torneios de beach tennis, acompanhe cada rodada e compartilhe o resultado.**

SETPOINT é um gerenciador de torneios para uso no clube ou na quadra. Monte a tabela, registre placares, acompanhe a classificação individual e conduza finais e pódio em um único fluxo.

## Funcionalidades

- **Super:** 8, 10, 12 ou 24 atletas, com parceiros rotativos.
- **Grupos:** 8, 12 ou 24 atletas, com parceiros rotativos ou duplas fixas.
- **Duplas abertas ou mistas:** no modo misto, cada dupla tem um atleta masculino e um feminino.
- **Tabela completa antes do início:** configuração de quadras, games e rodadas conforme o formato.
- **Lançamento de placares por rodada:** navegação entre rodadas, campos numéricos maiores e atualização automática do ranking.
- **Classificação e finais:** critérios individuais, desempates, final, disputa de 3º lugar e pódio.
- **Projeção de objetivo:** em torneios compartilhados Super, atletas acompanham cenários para chegar ao 1º lugar, top 2 ou top 3.
- **Convites compartilhados:** guests entram pelo link; o moderador pode incluir participantes sem celular.
- **Fotos opcionais:** avatars WebP são reduzidos localmente para até 8 kB e mantêm as iniciais como fallback.
- **Card para Instagram:** prévia antes de exportar, três layouts e foto de fundo opcional processada no navegador.
- **NPS:** pesquisa configurada no PostHog, disponível no footer e em momentos de conclusão do torneio.
- **Dashboard:** totais agregados de torneios, participantes, modos, formatos e conclusão em `/dashboard`.
- **Modo claro e escuro**, backups JSON e registro de build no rodapé.

## Formatos

| Formato | Rodadas | Quadras | Observações |
| --- | ---: | ---: | --- |
| Super 8 | 7 | 2 | Todos enfrentam os demais; parceiros não se repetem no formato aberto. |
| Super 10 | 10 | 2 | Descansos distribuídos para equilibrar partidas. |
| Super 12 | 11 | 3 | Todos jogam 8 partidas. |
| Super 12 | 12 | 2 | Rodada de equalização de jogos e descansos. |
| Super 24 | 23 | 6 | Todos jogam em cada rodada; parceiros alternam entre as categorias no misto. |
| Grupos rotativos abertos | 3 | 1 por grupo | Grupos de quatro; cada atleta forma parceria com os outros três. |
| Grupos rotativos mistos | 2 | 1 por grupo | Grupos de quatro balanceados com dois atletas de cada categoria. |
| Grupos fixos | Todos contra todos | Conforme formato | Duplas definidas antes de iniciar. |

No modo misto com 24 atletas, algumas parcerias voltam a acontecer porque existem menos parceiros possíveis que rodadas. O gerador valida a composição das duplas e a cobertura dos confrontos.

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

Os arquivos de produção são gerados em `dist/setpoint/browser`. O repositório não define um script de testes automatizados.

## Modo local

O torneio completo fica no `localStorage` do navegador. Não é necessário Supabase para montar tabelas, lançar resultados, gerar finais ou usar os backups.

Quando o Supabase estiver configurado e o login anônimo habilitado, o SETPOINT pode enviar métricas agregadas dos torneios locais. Nomes, fotos e placares individuais não fazem parte dessa tabela de métricas. Se a conexão ou autenticação não estiver disponível, o uso local continua funcionando.

## Modo compartilhado

O Supabase guarda o estado do torneio e sincroniza participantes, rodadas e resultados entre moderador e guests. O moderador entra sem e-mail por autenticação anônima; guests usam o convite e não precisam criar conta. O moderador ocupa uma vaga, inicia o torneio e registra os placares. Convites incompletos expiram em 15 minutos; torneios iniciados expiram conforme a política configurada no banco.

### Configuração do Supabase

1. Aplique uma vez, nesta ordem, as migrations pendentes pelo SQL Editor do projeto:
	- `202610310001_shared_tournaments.sql`
	- `202611010001_moderator_manual_participants.sql`
	- `202611010002_cancel_shared_tournament.sql`
	- `202611010003_archive_dashboard_metrics.sql`
	- `202611010004_local_tournament_metrics.sql`
	- `202611010005_super24_mixed_doubles.sql`
	- `202611010006_shared_player_avatars.sql`
2. Em **Authentication → URL Configuration**, configure o Site URL e permita os redirects usados, incluindo:
	- `https://richardmvb.github.io/setpoint-beach-tennis/dashboard`
	- `http://localhost:4200/dashboard`
	- `http://localhost:4201/dashboard`, se usar essa porta local.
3. Habilite **Allow anonymous sign-ins** para o moderador sem e-mail e os torneios locais que sincronizam métricas.
4. Para o dashboard, use o magic link com uma conta autorizada em `public.setpoint_dashboard_admins`. A RPC verifica a sessão e a allowlist no banco.

O dashboard lê dados agregados via RPC; não expõe nomes ou placares. Fotos compartilhadas são thumbnails WebP em Base64, limitadas pelo app e validadas no servidor. Elas ficam no estado privado do torneio compartilhado, sem bucket público.

### Configuração do deploy

Em **GitHub → Settings → Secrets and variables → Actions → Variables**, configure:

- `SUPABASE_URL`: Project URL do Supabase, sem `/rest/v1/`.
- `SUPABASE_PUBLISHABLE_KEY`: chave publicável do projeto.
- `NG_APP_POSTHOG_PROJECT_TOKEN`: project token do PostHog.
- `NG_APP_POSTHOG_HOST`: host PostHog da região do projeto.
- `NG_APP_LOCK_SCREEN_ENABLED`: opcional; use `true` para ativar a tela de desbloqueio do torneio. Ausente ou `false`, a tela fica desativada.

O workflow gera `runtime-config.js`, compila o Angular e publica no GitHub Pages. O fallback do Pages permite carregar `/dashboard` diretamente. Use apenas chaves publicáveis no frontend; nunca coloque `service_role` no código ou nas variáveis do build.

## Métricas

O PostHog acompanha eventos de criação e início de torneios, etapas do assistente, navegação, placares, finais, compartilhamentos e conclusão. O campo `doubles_format` diferencia torneios abertos e mistos; categorias e fotos individuais não são enviadas ao PostHog.

O Dashboard agrega torneios locais e compartilhados, incluindo Super 24, grupos, duplas mistas, abandonos, participantes e taxa de conclusão. A tabela `setpoint_dashboard_admins` controla quem pode consultar os dados.

## Ranking e integridade

O ranking considera sets ganhos, saldo de games e games pró. Empates podem exigir confronto direto ou sorteio antes da geração das finais. Descansos não concedem nem retiram pontos.

O gerador combina validações com busca heurística e aleatoriedade para distribuir confrontos e descansos. Ele verifica os invariantes do formato, mas não garante uma otimização matemática global. Revise a tabela gerada antes do início.

## Privacidade e segurança

- Torneios locais permanecem no dispositivo; o reset remove o estado e os caches locais do SETPOINT.
- Torneios compartilhados e participantes cancelados/expirados são arquivados para preservar métricas e histórico.
- Os tokens de convite são armazenados como hash no banco.
- As RPCs e políticas do Supabase são a autoridade de acesso. Não use `service_role` no navegador.
- Fotos são opcionais, comprimidas no dispositivo e enviadas somente no modo compartilhado para aparecer nos avatares do torneio.
