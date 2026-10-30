# SETPOINT — Angular MVP

Primeira versão local do gerenciador de torneios Super 8 e Super 10.

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
- Super 8 e Super 10, com inscrição individual.
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

## Persistência e privacidade

Os dados ficam somente no `localStorage` do navegador e neste perfil de usuário. Não há API, banco remoto, autenticação ou sincronização entre dispositivos. Qualquer pessoa com acesso ao mesmo perfil do navegador pode visualizar os dados. Limpar os dados do site/navegador pode apagar o torneio; use a exportação JSON para manter um backup.

## Regras do ranking

1. Sets ganhos: cada atleta da dupla vencedora recebe um set.
2. Saldo de games: games pró menos games contra, individualmente.
3. Games pró: critério final de desempate.

O descanso não concede nem retira pontos.

## Observações do gerador

O gerador usa busca heurística e aleatoriedade para reduzir repetições de parceiros e adversários, e prioriza jogadores com menos descansos. Não é um solver matemático que garanta a combinação global ótima. Antes de usar em torneios oficiais, confira as rodadas geradas e valide a distribuição com casos reais.
