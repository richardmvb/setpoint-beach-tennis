# SETPOINT — Angular MVP

Gerenciador de torneios Super 8/10/12 e grupos, com execução local ou compartilhada.

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm 10+

## Executar localmente

```bash
npm install
npm start
```

Abra `http://localhost:4200`.

Para gerar a versão de produção:

```bash
npm run build
```

Os arquivos compilados ficam em `dist/setpoint/browser`.

## O que está implementado

- Angular standalone components e TypeScript strict.
- Super 8, Super 10 e Super 12, com inscrição individual.
- Torneios locais ou compartilhados, com grupos rotativos/duplas fixas.
- Configuração de quadras, games para vencer e quantidade de rodadas.
- Geração antecipada de todas as rodadas.
- Tentativa heurística de evitar repetição de parceiros e adversários.
- Distribuição de descanso priorizando quem descansou menos.
- Navegação por abas entre rodadas; resultados podem ser lançados em qualquer ordem.
- Correção e remoção de placares.
- Ranking individual: sets ganhos, saldo de games e games pró.
- Tema claro e escuro.
- Persistência do torneio e preferência de tema em `localStorage`.
- Exportação de backup em JSON.

## Modo local

O modo local continua sem conta ou backend. Os dados ficam somente no `localStorage` deste navegador e não são sincronizados. Use a exportação JSON para manter um backup.

## Modo compartilhado

O modo compartilhado usa Supabase. Defina `SUPABASE_URL` (Project URL, sem `/rest/v1/`) e `SUPABASE_PUBLISHABLE_KEY` nas GitHub Actions Variables do repositório. O workflow do Pages injeta esses valores em runtime; sem eles, o modo local continua disponível. A chave publishable é pública; nunca use `service_role` no site.

Antes de publicar a primeira versão compartilhada:

1. Abra `supabase/migrations/202610310001_shared_tournaments.sql` no SQL Editor do projeto Supabase e execute a migration uma vez. Isso cria tabelas, RPCs com acesso restrito e a limpeza agendada de torneios expirados.
2. Em **Authentication → URL Configuration**, defina `https://richardmvb.github.io/setpoint-beach-tennis/` como Site URL e adicione também `http://localhost:4200/` como Redirect URL para desenvolvimento.
3. Habilite o provedor **Email** no Supabase Auth para o login mágico do moderador.
4. Faça push do código para `main` e acompanhe o deploy em **GitHub → Actions**.

Os convites guardam apenas o hash do token no banco, aceitam somente o nome do convidado e expiram após 15 minutos se as vagas não forem preenchidas. O moderador participa e é o único que pode iniciar e editar placares. O torneio compartilhado expira 24 horas depois de iniciado. As políticas e RPCs no banco são a autoridade de autorização; a chave `service_role` não deve ser colocada no frontend ou nas GitHub Variables usadas pelo build.

## Regras do ranking

1. Sets ganhos: cada atleta da dupla vencedora recebe um set.
2. Saldo de games: games pró menos games contra, individualmente.
3. Games pró: critério final de desempate.

O descanso não concede nem retira pontos.

## Observações do gerador

O gerador usa busca heurística e aleatoriedade para reduzir repetições de parceiros e adversários, e prioriza jogadores com menos descansos. Não é um solver matemático que garanta a combinação global ótima. Antes de usar em torneios oficiais, confira as rodadas geradas e valide a distribuição com casos reais.
