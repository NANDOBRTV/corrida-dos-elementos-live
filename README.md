# 🏁 Corrida dos Elementos LIVE

Projeto independente de **corrida automática 3D em estilo voxel**, pensado para testes no navegador e futura integração com uma LIVE no TikTok. Repositório **separado** de LivePulse Batalha e do Floot.

## O que já existe

- Cinco cenários 3D com Three.js: 🌲 Floresta → 🏜️ Deserto → 🌋 Vulcão → ❄️ Gelo → 🔥 Inferno.
- Corredores voxel com animações, nomes, cores, obstáculos e câmera dinâmica.
- Motor automático com passos fixos de 50 ms e semente reproduzível.
- Estados LOBBY (20s), COUNTDOWN (5s), RUNNING (até 85s) e RESULTS (10s).
- Ranking Top 5, pódio, largada, chegada e encerramento quando todos terminam.
- Simulador de comentários: comando apenas **entrar** (aceita espaços nas pontas e variações maiúsculas/minúsculas).
- Uma inscrição por ID e rodada; durante contagem, corrida e resultados, o espectador entra na **próxima rodada**, nunca depois da largada. Ninguém é reinscrito automaticamente.
- Até 50 corredores fictícios por rodada, turbo de teste e filas separadas.
- Prévia visual de cada mapa sem mudar a rodada.
- Persistência de demonstração **somente neste navegador**, em localStorage.

### ⚠️ Limites importantes

Este é um **protótipo local para testes**, não um conector TikTok funcionando. **Não lê comentários, curtidas ou presentes reais.** Não há banco compartilhado nem autenticação de operador no GitHub Pages. As inscrições não sincronizam entre celulares e navegadores. O painel de simulação é público e NÃO deve receber credenciais. Nenhum serviço fica ativo 24 horas quando a página é fechada. Para a LIVE real precisaremos de serviço Node.js externo, backend persistente e autenticação.

## 🚀 Como publicar no GitHub Pages pelo celular

1. Abra este repositório no GitHub.
2. Acesse **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha **main** e a pasta **/(root)**.
5. Toque em **Save** e veja o endereço publicado na própria página de Pages.
6. Abra o endereço publicado no Chrome do seu Redmi 13C.

A publicação do site exige que você habilite GitHub Pages uma vez. Three.js é carregado do jsDelivr, portanto o navegador precisa de internet.

### Como testar

- Abra o jogo: dez corredores de demonstração começam na primeira rodada.
- No **Painel do Operador**, escolha um ID fictício estável, um nome e envie o comentário **entrar**.
- Repita cinco vezes para confirmar que o ID não duplica.
- Use **Avançar fase** para iniciar a corrida, depois envie **entrar** com outro ID; ele aparecerá na próxima fila.
- Após os resultados, avance para o lobby seguinte e observe a promoção da fila, sem reinscrição automática.
- Use **Visualizar cenário 3D** para conferir os cinco biomas. Essa visualização não altera classificação.
- Use **Pausar motor**, **Turbo teste** e **Reiniciar demonstração** conforme necessário.
- Para executar os testes automatizados no navegador, abra a página [tests.html](./tests.html) no site publicado.

## Testes e organização

Os testes são executáveis também pelo GitHub Actions. Para rodar com Node 22, use npm run check e npm test (não é necessário instalar pacotes npm).

| Arquivo | Função |
|---|---|
| index.html | Interface vertical e controles |
| assets/styles.css | Layout responsivo |
| src/config.js | Biomas e posições de obstáculos |
| src/engine.js | Corridas, inscrições, filas, ranking |
| src/world.js | Pista e cinco cenários 3D |
| src/avatars.js | Personagens voxel e animações |
| src/app.js | UI, WebGL, simulação e salvamento local |
| src/selftest.js | Casos automatizados |
| tests.html e tests/browser.js | Relatório de testes no navegador |
| tests/engine.test.mjs | Testes Node |
| .github/workflows/verify.yml | Verificação em cada push |

## Próximas etapas

1. Validar os cinco mapas visualmente no celular e corrigir eventuais problemas com base nos prints.
2. Implementar backend com inscrições e resultados sincronizados.
3. Integrar serviço Node.js persistente ao TikTok LIVE de maneira autenticada e segura.
4. Adicionar presentes reais, efeitos e monitoramento.
5. Avaliar infraestrutura para operação contínua após testes reais.

**Nunca coloque chaves, senhas ou tokens TikTok em um repositório público.**