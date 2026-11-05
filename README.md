## Versão 4.0.1 — pista limpa no mapa de Gelo

O asfalto do circuito W de 400 metros agora é **cinza-escuro e completamente livre de neve**. As montanhas, árvores e margens da estrada continuam nevadas; os bancos de neve só são colocados depois de verificar o afastamento mínimo de 2,4 m da borda do asfalto e de todas as curvas que passam próximas. Os flocos de neve sobre a câmera/pista foram retirados apenas do cenário de Gelo, mantendo as folhas ambientes na Floresta. A pista nativa opcional do Roblox Studio também recebe o asfalto mais escuro. Não há alteração nos presentes, obstáculos acionados por presentes, duração de voltas ou câmera.

---

## Versão 4.0 — corrida de 400 metros por volta e veículos acionados por presentes

Cada volta passa a ter 400 metros e o operador pode escolher de 1 a 10 voltas para a próxima corrida. O motor calcula a distância total como 400 × voltas, mantendo o progresso oficial das rodadas antigas salvas de 5 km, 300 m e 150 m. O carro/kart e a moto aparecem somente após um presente processado durante a fase RUNNING, por 12 segundos, sem bônus de velocidade. O destinatário inscrito recebe o efeito, ou outro corredor em movimento quando quem presenteou não está na prova. A versão web exibe modelos originais; a versão nativa Roblox continua dependente de Roblox Studio. Os testes com presentes fictícios não representam eventos reais do TikTok.

---

## Versão 3.4.1 — close-ups em intervalos aleatórios de 0 a 10 segundos

Em vez de um corte fixo a cada 10 segundos, **após cada destaque de 3,2 segundos** a câmera aguarda um tempo pseudoaleatório entre **0 e 10 segundos** até destacar outro corredor. Espera zero significa que o próximo close começa imediatamente após o anterior, sem sobreposição. Os intervalos são derivados da rodada e do índice do destaque, permanecendo estáveis com a mesma corrida mesmo após recarregamento ou reconexão. O tempo é contado no relógio oficial da corrida; resultados, ausência de corredores e lobby desativam o efeito.

A mesma regra de intervalo está preparada para a câmera Roblox Studio, que ainda requer execução e validação dentro da experiência Roblox. Não há alteração no motor físico, ranking ou presentes.

---

### Close-up na versão Roblox Studio

A câmera opcional no Roblox Studio também foi preparada para destacar a cada 10 segundos um avatar real aleatório que esteja correndo. O script recebe `RaceMs`, `RacePhase` e `RaceRound` por atributos replicados, aproxima durante 3,2 segundos e retorna à câmera geral. Nenhuma chave secreta vai para o script do cliente. **Ainda não houve validação dentro do Roblox Studio**; a versão web no Render é testada separadamente.

---

## Versão 3.4 — close-up automático a cada 10 segundos

Na corrida de 5.000 metros, a câmera 3D destaca um corredor aleatório a cada **10 segundos de tempo oficial de corrida**, acompanha seu rosto/roupa em um enquadramento próximo por **3,2 segundos** e retorna suavemente à visão normal do pelotão. A seleção usa uma semente estável e evita repetir o mesmo corredor duas vezes seguidas; somente corredores em movimento e dentro da região visível da pista podem ser selecionados. Durante o close, aparece um pequeno identificador com nome e distância. Fora de RUNNING, sem corredores ou após a chegada, o efeito não é ativado.

A animação usa **a câmera existente**, sem novos modelos e sem novas chamadas de desenho: somente altera posição e alvo da câmera. Os resultados oficiais, velocidade, presentes, obstáculos, filas e distância não são modificados. Em testes, a prévia de 50 corredores também recebe o close após 10 segundos.

---

### Ponte Roblox Studio e presentes

A resposta privada `/api/roblox/participants` agora inclui apenas os obstáculos ativos dos presentes. Os scripts nativos espelham a posição na mesma curva do circuito, removem os objetos expirados e marcam cores diferentes para simulações. Nada aparece sem evento de presente. A física continua sendo calculada no servidor Node; o script precisa de validação no Roblox Studio antes de uso real.

---

## Versão 3.3 — minimapa livre e obstáculos somente por presentes

Na tela vertical, o minimapa agora mostra **somente o traçado curvo e os pontos dos corredores**. Foram retirados os dois retângulos, os fundos, as bordas, as sombras decorativas e os rótulos de distância do minimapa; o cronômetro e o ranking permanecem como estão.

**Não existem mais obstáculos automáticos na estrada**: o gerador periódico foi desativado tanto no motor de corrida quanto no cenário 3D. Um presente validado durante RUNNING pode criar **um obstáculo temporário** na pista à frente do pelotão, mesmo quando o remetente não está inscrito. O obstáculo dura até 16 segundos; até 8 são mostrados ao mesmo tempo e, por segurança/performance, até 24 podem ser acionados na rodada. Presente com contagem repetida não gera 30 obstáculos. Combos/eventos duplicados são filtrados no servidor antes da alteração oficial. O obstáculo afeta somente quem cruza sua faixa (desvio ou redução temporária, conforme cálculo determinístico do servidor). Não há cobrança diferente por tipo de presente nem garantia de vitória; o turbo existente continua limitado. Presentes enviados durante lobby/resultado não criam obstáculos.

**TESTE:** o botão administrativo SIMULAR PRESENTE utiliza o mesmo mecanismo, porém cria obstáculo marcado como fictício. A LIVE real do TikTok permanece desativada por padrão. O servidor e o navegador seguem sincronizados pelo mesmo snapshot; obstáculos expirados ou de rodadas anteriores não são exibidos.

---

### Demonstração instantânea do cotovelo

Abra `/?view=live&quality=low&showcase=1&section=hairpin&biome=ice` para visualizar imediatamente 50 corredores fictícios na primeira curva em U. Para testar outras curvas use `section=hairpin2` e `section=hairpin3`; para conferir a Floresta, use `biome=forest`. Essas URLs funcionam somente como **prévia local**, sem inscrições, presentes ou mudanças no PostgreSQL.

---

### Mesma pista no Roblox Studio

Atualizados os arquivos `roblox/LiveRace.server.luau` e `roblox/LiveCamera.client.luau` com as **três curvas de 180° idênticas às do navegador**, encostas acompanhando a estrada, marcas de distância, chegada definitiva e câmera aérea automática nos cotovelos. Esta é uma implementação de código preparada para o Roblox Studio; ainda não houve execução dentro da plataforma.

---

## Versão 3.2 — montanha nevada e cotovelos de 180°

A trilha de 5.000 metros foi reconstruída por integração de comprimentos reais de arco. São três curvas fechadas de 178°, com zigue-zagues de encosta, retas panorâmicas, pequenas elevações, placas a cada 500 m, proteções laterais e terreno nevado. As coordenadas X e Z agora se movem e retornam durante os cotovelos. O minimapa deve mostrar o traçado sinuoso. Todo o cálculo visual está isolado em [src/track-path.js](src/track-path.js), sem mudar classificação ou física da corrida.

Os scripts Roblox Studio têm a mesma meta visual, mas exigem validação dentro de uma experiência Roblox.

---

### Roblox Studio — pista 3D sinuosa, 5 km

A versão opcional para Roblox Studio também ganhou o mesmo percurso matemático, com estrada dividida em trechos que fazem curvas, sinalização a cada 500m, faixas, árvores acompanhando o caminho, pórtico de chegada na posição de 5.000m e câmera que acompanha as curvas. Os personagens Roblox verdadeiros são criados pela API nativa **somente dentro da experiência Roblox**. Esses scripts não foram executados em Studio e não substituem o jogo WebGL do Render.

---

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
