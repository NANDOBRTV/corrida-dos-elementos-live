## Versão 3.1 — circuito sinuoso de 5.000 metros

A pista 3D deixou de ser apenas uma reta: o jogo agora gera **curvas para a esquerda e para a direita, subidas leves, bordas acompanhando a estrada, guardrails e placas a cada 500m**, com chegada única no marco de 5.000m. A câmera segue o contorno da estrada e os corredores, obstáculos e efeitos permanecem alinhados às faixas. Os cenários de Gelo e Floresta reaproveitam apenas dois trechos de 300m em GPU para manter o orçamento gráfico do Android. O motor de corrida e a progressão persistida não foram modificados; os percursos legados de 150m/300m continuam compatíveis.

O código matemático da pista está em [src/track-path.js](src/track-path.js), com testes de continuidade e enquadramento 3D. Os scripts opcionais do Roblox Studio ainda requerem validação na plataforma.

---

### Roblox Studio — progresso suavizado

A ponte protegida envia também a velocidade oficial do corredor. O cliente Roblox faz uma previsão visual entre consultas de 2 segundos, sem modificar a corrida no servidor, e anima braços e pernas localmente. Essa parte ainda depende de validação dentro do Roblox Studio.

---

### Versão 3.0.1 — até 50 consultas agrupadas e pista Roblox Studio

A consulta pública pelo nome Roblox agora aceita até 50 nomes distintos por lote, com limite de chamadas para evitar saturação da API. Permite `entrar @NomeRoblox` além de `entrar NomeRoblox`. O módulo Roblox Studio inclui terreno original com Gelo/Floresta e 600 studs de cenário reutilizável. **A versão Roblox Studio ainda não foi executada em um servidor Roblox real**.

---

## Versão 3.0 — entrada por usuário Roblox

A partir do comentário `entrar NomeRoblox`, o backend consulta a API oficial de nomes e associa o ID numérico da conta à inscrição atual ou à próxima fila. O ranking exibe o nome de usuário encontrado, sem confundir com o apelido de exibição. Há cache, limite de requisições e proteção contra duas inscrições do mesmo personagem na mesma rodada. O comando legado `entrar` continua válido para simulação.

**Importante:** informar o nome de uma conta pública não prova que o espectador é o proprietário. O site WebGL continua exibindo modelos próprios: o carregamento do avatar 3D verdadeiro só ocorre dentro do Roblox Studio/experiência autorizada, mediante ponte protegida por chave privada. Nenhuma LIVE real foi habilitada.

---

### Revisão visual v2.9.1

Após comparar capturas reais de Chromium 390×844 com o vídeo de referência, a câmera foi afastada e elevada para enquadrar mais corredores e mais pista de neve. As árvores agora têm folhagem verde-escura com camadas brancas de neve, e a nevasca usa partículas maiores em uma única malha de pontos. Painéis de ranking/tempo/minimapa ficaram mais proporcionais à referência. Motor, obstáculos, física e duração da pista permanecem inalterados.

---

## Versão 2.9 — referência visual de corrida com avatares humanoides blocados

A partir do vídeo fornecido pelo proprietário do projeto, a pista de Gelo ganhou uma apresentação mais próxima de uma corrida de avatares estilo Roblox: **personagens originais humanoides R6-like com roupa de corpo inteiro, cabelos, bonés, cachecóis, mochilas e cores variadas**, câmera mais baixa e próxima por trás dos corredores, asfalto cinza, bordas de neve, placares escuros e ícones de kart/moto/jetpack. Os acessórios continuam cosméticos, não há compra nem bônus de velocidade. As formas são processadas em malha instanciada para preservar o desempenho de 50 corredores no Android.

**Não são avatares oficiais do Roblox importados de contas reais.** Para reproduzir roupas ou personagens exatos do vídeo seriam necessários os respectivos arquivos/modelos com direito de uso, animações compatíveis e otimização de malha. Esta versão reproduz o estilo visual com modelos próprios. O TikTok real permanece desativado por padrão; não há transmissor RTMP embutido.

---

### Runbook operacional e critérios para concluir a LIVE

Veja [docs/OPERACAO-PRE-LIVE.md](docs/OPERACAO-PRE-LIVE.md) para links, checklist de QA no Android, segurança, persistência, data de vencimento do PostgreSQL e requisitos de captura de vídeo. O conector real permanece desativado por padrão.

---

## Versão 2.8.1 — simulação segura de curtidas

O painel do operador agora inclui **♥ SIMULAR 10 CURTIDAS**, disponível localmente ou no Render mediante ADMIN_KEY. Todas essas curtidas são marcadas como [TESTE], contabilizadas separadamente das curtidas reais observadas e não interferem em velocidade, inscrição ou ranking. O diagnóstico do servidor mantém os dois contadores separados. Nenhuma LIVE real é iniciada.

---

## Versão 2.7 — corrida de 5 km otimizada

A pista oficial agora tem **5.000 metros** nos dois biomas (❄️ Gelo e 🌲 Floresta). A prova pode durar até **25 minutos**; encerra antes se todos os corredores chegarem. O sistema de classificação, filas e presentes fictícios continua igual.

**Streaming 3D:** o celular mantém apenas **600 m de terreno e obstáculos renderizados** em dois trechos reutilizáveis de 300 m. O cenário avança de forma contínua, sem renderizar os 5.000 m completos. A única faixa de chegada permanece no metro 5.000.

**Compatibilidade:** corridas de 150 m ou 300 m que foram salvas anteriormente mantêm a distância original até terminar. Só a próxima rodada começa nos 5.000 m; o PostgreSQL mantém inscrições, ranking, resultados e histórico.

Benchmark em `/benchmark.html`: 50 corredores sintéticos, testa o início e a região final dos 5 km. A versão no Redmi 13C ainda precisa ser medida; testes automatizados não garantem FPS físico. TikTok real continua desativado.

---

# 🏁 Corrida dos Elementos LIVE

Projeto independente de **corrida automática 3D em estilo voxel**, pensado para testes no navegador e futura integração com uma LIVE no TikTok. Repositório **separado** de LivePulse Batalha e do Floot.

## O que já existe

- Dois cenários 3D definitivos com Three.js: ❄️ Gelo ↔ 🌲 Floresta, alternando a cada rodada.
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
- Use **Visualizar cenário 3D** para conferir os dois biomas. Essa visualização não altera classificação.
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
| src/world.js | Pista e dois cenários 3D |
| src/avatars.js | Personagens voxel e animações |
| src/app.js | UI, WebGL, simulação e salvamento local |
| src/selftest.js | Casos automatizados |
| tests.html e tests/browser.js | Relatório de testes no navegador |
| tests/engine.test.mjs | Testes Node |
| .github/workflows/verify.yml | Verificação em cada push |

## Próximas etapas

1. Validar Gelo e Floresta visualmente no celular e corrigir eventuais problemas com base nos prints.
2. Implementar backend com inscrições e resultados sincronizados.
3. Integrar serviço Node.js persistente ao TikTok LIVE de maneira autenticada e segura.
4. Adicionar presentes reais, efeitos e monitoramento.
5. Avaliar infraestrutura para operação contínua após testes reais.

**Nunca coloque chaves, senhas ou tokens TikTok em um repositório público.**

## 📺 Modo de transmissão vertical (versão 1.5)

Existem **duas visualizações independentes** do mesmo jogo no Render:

- **Tela LIVE limpa (sem painel do operador):** https://corrida-dos-elementos-live.onrender.com/?view=live
- **Controles e diagnóstico:** https://corrida-dos-elementos-live.onrender.com/?view=operator

No modo LIVE, o painel que solicita ADMIN_KEY, botões de simulação e diagnósticos ficam ocultos da apresentação. A arena recebe o estado oficial do servidor por SSE. O link pode ser usado como fonte de navegador em um programa de transmissão, desde que a conta TikTok disponha de um método de envio de vídeo autorizado. **Abrir a URL não inicia uma LIVE nem gera fluxo RTMP.**

A tela de operador mantém todos os controles e oferece um botão para abrir a tela limpa.

### 🏆 Campeões da temporada

Ao terminar uma corrida, os resultados confirmados alimentam automaticamente um **Top 3 por vitórias**, com desempate por pódios, provas concluídas e melhor tempo. Também aparece o vencedor mais recente.

- Vitórias são contabilizadas somente para corredores que efetivamente cruzaram a chegada.
- Cada resultado é gravado uma única vez por rodada; repetições não duplicam vitórias.
- O histórico contém até 12 rodadas recentes, e o ranking agregado contém até 100 participantes.
- Os registros ficam no snapshot do jogo na tabela PostgreSQL elemental_game_state, quando a persistência estiver habilitada.
- A página revela nomes públicos dos participantes, mas os identificadores TikTok são pseudonimizados.

Snapshots anteriores à versão 1.5, sem a estrutura de campeões, continuam aceitos; as novas estatísticas começam a partir da próxima corrida finalizada.

**Limites:** o Render Free pode suspender por inatividade; o banco gratuito expira e a infraestrutura ainda não produz nem transmite vídeo para o TikTok.

## ⚙️ Pré-lançamento e desempenho (v1.6)

**Não haverá testes com uma LIVE real do TikTok até que o jogo esteja concluído.** O nome da conta já pode ficar configurado no Render, mas TIKTOK_LIVE_MODE permanece desativado. Apenas simulações locais ou autenticadas estão liberadas.

O cenário 3D agora agrupa blocos do terreno em malhas instanciadas, reduzindo o número de chamadas de desenho. Na tela do operador é possível selecionar Auto, Leve (30 FPS e sem sombras), Equilibrado (45 FPS) ou Alto (60 FPS). A tela de transmissão aceita parâmetro de qualidade, como:

- https://corrida-dos-elementos-live.onrender.com/?view=live&quality=low

A qualidade visual não altera física, fila nem classificação. O Redmi 13C e outros aparelhos modestos podem usar o perfil Leve.

Confira o plano de conclusão e a lista das pendências antes do lançamento: [docs/PRE-LANCAMENTO.md](docs/PRE-LANCAMENTO.md).


## Versão 2.3 — Gelo e Floresta (pré-lançamento)

A pedido do projeto, somente **❄️ Gelo e 🌲 Floresta** participam da rotação oficial. Os três mapas anteriores deixam de ser gerados ou selecionados no painel. O benchmark local foi reduzido de dez para **quatro etapas** (dois mapas × fixo/Auto).

Snapshots PostgreSQL legados em Deserto, Vulcão ou Inferno são migrados para o novo mapa da rodada, sem apagar inscritos, posições, resultados ou dados do campeonato. Os registros históricos antigos permanecem armazenados.

A otimização 3D dos corredores agora agrupa cubos animados em uma malha instanciada para reduzir chamadas de desenho. O FPS do Redmi 13C precisa ser medido novamente: remover mapas não reduz, por si só, a carga de renderização durante uma corrida, pois o jogo já carregava um cenário por vez.

O conector de eventos TikTok reais continua desativado até a conclusão do jogo.
