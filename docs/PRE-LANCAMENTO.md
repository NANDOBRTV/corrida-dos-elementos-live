# Plano de conclusão — Corrida dos Elementos LIVE

**Estado: pré-lançamento. Não testar com audiência ou presentes reais antes da finalização do jogo.**

## Já implementado
- [x] Motor no Node.js, filas, ranking e vencedores salvos no PostgreSQL
- [x] Cinco biomas voxel 3D com rotação automática
- [x] Tela limpa 9:16 e painel administrativo protegido
- [x] Simulação de entradas e presentes, com diagnósticos autenticados
- [x] Perfis gráficos automáticos para Android (v1.6)
- [x] Agrupamento de cenário 3D e gerenciamento de memória (v1.6)
- [x] Conector TikTok real explicitamente desligado no pré-lançamento (v1.6)

## Ainda faltam antes da LIVE real
- [ ] Conferir os cinco biomas no navegador do celular com screenshots
- [ ] Revisar FPS e clareza das animações com até 50 corredores
- [ ] Corrigir problemas de WebGL e interface encontrados nos testes locais
- [ ] Testar recuperação do Postgres após reinício real do servidor
- [ ] Utilizar hospedagem que não suspenda por inatividade
- [ ] Migrar o PostgreSQL gratuito antes do vencimento
- [ ] Configurar captura de vídeo e canal autorizado para transmitir no TikTok
- [ ] Só depois: habilitar chat real e realizar primeiro teste de LIVE

## Testes sem transmissão

Abra https://corrida-dos-elementos-live.onrender.com/?view=operator no celular. Use a ADMIN_KEY do Render para simular o comando entrar, avançar a corrida e experimentar presentes fictícios. Não mostre a chave em prints.

Para inspecionar o modo vertical com gráficos leves, abra https://corrida-dos-elementos-live.onrender.com/?view=live&quality=low .

No painel de operador, escolha DESEMPENHO 3D NO CELULAR:
- Auto: usa memória/CPU declarada pelo navegador para escolher o perfil.
- Leve: até 30 FPS, sem sombras e menos decoração.
- Equilibrado: até 45 FPS, sombras e cenário completo.
- Alto: até 60 FPS em dispositivos mais potentes.

O modo gráfico não modifica regras de jogo, corrida, inscrições ou ranking.

## Segurança de pré-lançamento

Mantenha TIKTOK_LIVE_MODE=disabled no serviço Render, mesmo com TIKTOK_USERNAME cadastrado. A leitura real do chat e presentes só é ativada com TIKTOK_LIVE_MODE=enabled, na etapa final aprovada. Enquanto isso, o jogo funciona exclusivamente com as simulações de teste.

O Render Free não é garantia de 24h: suspende por inatividade. Esta versão não adiciona mecanismos para contornar esse limite; o requisito de hospedagem sempre ativa e transmissão de vídeo continua pendente.

## QA automatizado com navegador real — versão 1.7

Antes de testar em uma LIVE, a versão 1.7 acrescenta um workflow do GitHub Actions chamado **QA visual Android — sem LIVE real**. Ele inicia um servidor Node.js local de teste, com banco em memória e eventos TikTok explicitamente desativados. Um Chromium headless com WebGL por software verifica:

- Se todos os cinco biomas carregam em WebGL e produzem imagens distintas, sem erros JavaScript.
- Se a tela limpa fica sem painel administrativo, mostra aviso de pré-lançamento e não apresenta rolagem horizontal em 320, 390, 430 e 768 pixels.
- Se cinquenta corredores simulados aparecem no estado autoritativo e se o ranking da tela recebe atualizações do servidor.
- Se o endpoint do servidor continua com a conexão TikTok real desativada.

O workflow anexa capturas de tela em **Actions → execução QA visual → Artifacts → corrida-qa-visual** para inspeção posterior, junto com logs e relatório HTML. A versão do Playwright é fixada em 1.64.1 e instalada somente como dependência de desenvolvimento; ela não é necessária para rodar o jogo no Render.

**Limite:** os testes visuais de Chromium emulado não substituem os testes de desempenho e toque no hardware real do Redmi 13C. Também não medem os FPS reais do celular nem comprovam transmissão de vídeo no TikTok.

Comandos opcionais no computador de desenvolvimento: npm install; npx playwright install --with-deps chromium; npm run test:browser. O servidor de testes é iniciado automaticamente pelo Playwright. Não é necessário abrir nenhuma LIVE.

### Melhorias descobertas nas capturas

A revisão das capturas automatizadas identificou excesso de sobreposição nos nomes e pouca visibilidade dos corredores na largada. Na própria versão 1.7 foram feitos três ajustes:

1. Os 50 participantes ocupam visualmente uma grade de até 10 linhas por 5 raias, sem alterar velocidade, progresso ou resultado calculados no servidor.
2. Os nomes flutuantes aparecem apenas nos corredores líderes durante a corrida; o ranking continua exibindo os nomes completos.
3. A câmera foi aproximada e o nome do bioma deixou de ser truncado nas telas mais estreitas.

As capturas e o relatório automático permitem comparar essas melhorias. Ainda é necessário confirmar a experiência no aparelho físico.

## Teste de desempenho e recuperação real — versão 1.8

**Sem LIVE do TikTok:** continua definido TIKTOK_LIVE_MODE=disabled.

### Teste de FPS no Redmi 13C

1. Abra https://corrida-dos-elementos-live.onrender.com/?view=live&quality=low&debug=1 no Chrome.
2. A pequena etiqueta no alto da pista exibe os FPS de renderização medidos no **seu navegador**, a meta 30 FPS e a quantidade aproximada de chamadas de desenho do WebGL.
3. Se os FPS caírem, mantenha o perfil Leve e compare com ?quality=balanced (apenas se o aparelho estiver fluido).
4. Para uma apresentação sem a etiqueta, abra a tela comum em ?view=live&quality=low.
5. No painel do operador, a área **DESEMPENHO 3D NO CELULAR** mostra FPS, P95 do intervalo entre frames, percentual de frames lentos, draw calls e uma avaliação automática.

**Limitações:** uma medida do navegador não é benchmark de FPS de streaming TikTok; o navegador pode pausar no background ou reduzir quadros para poupar bateria. O diagnóstico nunca muda o motor oficial do servidor.

### Conferência do PostgreSQL antes e depois de um deploy

No painel do operador, digite sua ADMIN_KEY e toque em **VERIFICAR RECUPERAÇÃO DO POSTGRESQL**. O backend consulta diretamente o banco privado do Render e retorna apenas:
- se está acessível e se o snapshot é válido;
- qual rodada está persistida e qual está rodando;
- se o último processo iniciou carregando um snapshot salvo;
- qual rodada foi carregada na última inicialização;
- se há uma gravação ainda não confirmada.

O endpoint GET /api/admin/storage-check exige o mesmo token administrativo do restante da aplicação. Ele não mostra inscritos, identificadores, chaves, dados completos ou URLs do banco.

**Validação de recuperação:** registre rodada salva e rodada restaurada, publique uma nova versão normalmente, e confira o mesmo endpoint após o novo deploy. Também verifique os logs [game] Estado recuperado do armazenamento: rodada N. O Render pode reiniciar por diversos motivos; a recuperação positiva demonstra que um snapshot foi lido, mas não substitui testes de indisponibilidade e redundância de banco.

A ferramenta externa para consultar PostgreSQL pode estar bloqueada pela allowlist de rede; o novo endpoint foi projetado para executar a consulta pelo próprio servidor Render (na mesma rede do banco). Nunca abra o banco publicamente só para executar diagnósticos.

**Render Free ainda suspende por inatividade** e o banco gratuito não é definitivo; nada nesta versão habilita atividade 24 horas no plano gratuito.


## Versão 1.9 — conexão resistente a reinicializações do Render

O servidor informa um ID temporário e aleatório por **processo** (não é identificador de pessoa). O navegador compara esse ID nas respostas de /api/state, /health e nos eventos SSE. Se o Render reiniciar e o ID mudar, o aplicativo identifica a nova instância e volta a receber o estado oficial sem criar uma corrida local paralela.

O navegador monitora a idade da última atualização oficial. Uma falha de SSE aciona status **Reconectando**; se os dados ficarem antigos, mostra explicitamente **Conexão interrompida — estado não atualizado** em vez de afirmar falsamente que está online. Enquanto o SSE está indisponível, tenta buscar o estado por HTTP até a conexão voltar. A mesma informação aparece na tela 9:16, mesmo sem o painel do operador.

Os testes automáticos verificam:
- Interrupção da rede e recuperação posterior no Chromium, sem conectar ao TikTok.
- Reconhecimento de dados obsoletos, fallback HTTP e mudança de instância do Render.
- Doze espectadores conectados simultaneamente ao mesmo estado de corrida via SSE.
- Recuperação da mesma inscrição após reinicialização simulada, com um ID de processo diferente.

Limites: **a reconexão automática não impede o Render Free de suspender por inatividade**. Durante uma suspensão o motor não está executando corridas, e a tela avisa que está aguardando. Não há mecanismo de keep-alive artificial, cobrança de plano pago nem tentativa de transmissão TikTok. O PostgreSQL salva o estado e permite retomar, mas não recupera os segundos de motor que deixaram de ocorrer enquanto o serviço estava dormindo.


## Versão 2.0 — qualidade gráfica adaptativa sem cortar cenários

O modo **Automático**, selecionado por padrão, utiliza o medidor local de FPS para ajustar somente a **resolução interna de renderização WebGL**. Ele não muda a pista, as regras, as animações, as cores, as árvores, os cactos, os cristais, a lava nem os demais objetos do bioma atual. Também não altera filas, corredores, estado do Render ou PostgreSQL.

A escala pode passar por **100%, 88%, 76% e 65%**, sempre relativa à resolução do perfil inicial escolhido para o aparelho. A mudança ocorre sem reconstruir o mundo ou recarregar a página.

Para evitar oscilações:
- Considera somente medições com pelo menos 35 frames.
- Reduz após três avaliações consecutivas de FPS baixo, respeitando intervalo mínimo de oito segundos entre reduções.
- Recupera aos poucos após oito avaliações consecutivas de estabilidade e pelo menos vinte segundos desde a última alteração.
- Descarta as amostras anteriores quando o aplicativo sai do segundo plano; não reinicia o nível atual.

**Leve, Equilibrado e Alto são perfis manuais fixos:** não mudam automaticamente. Para voltar ao modo adaptativo, escolha Automático no painel ou retire o parâmetro quality=low / quality=balanced / quality=high da URL.

Na tela com debug, a sobreposição mostra FPS e porcentagem da resolução atual. Exemplo:
https://corrida-dos-elementos-live.onrender.com/?view=live&debug=1

**Nota:** a redução de resolução pode suavizar a nitidez, mas mantém a composição do cenário e a iluminação. Não garante 30 FPS em todo celular. Ainda são necessários testes no aparelho físico e não há LIVE do TikTok durante o pré-lançamento.


## Versão 2.1 — benchmark comparativo no próprio Android

A página **/benchmark.html** permite validar quanto o FPS melhora com o modo adaptativo **no aparelho físico em que a página for aberta**, sem PC, sem conta TikTok, sem gastar presentes e sem acessar o PostgreSQL.

Endereço público previsto: https://corrida-dos-elementos-live.onrender.com/benchmark.html

O teste cria uma cena local e independente com os 50 corredores fictícios e percorre Floresta, Deserto, Vulcão, Gelo e Inferno. Para cada bioma ele mede dois ensaios: resolução fixa de 100% e resolução adaptativa. O perfil gráfico inicial e os objetos/iluminação são iguais nas duas condições. A ordem de execução alterna entre os mapas para diminuir o efeito da temperatura do aparelho sobre o resultado.

O processo completo tem 10 etapas de aproximadamente 14 segundos cada (mais preparação), com relatório local por mapa. Mostra média de FPS, comparação percentual e resolução adaptativa final. **Não envia medições automaticamente**: o usuário pode copiar o relatório ou compartilhar por ação explícita do navegador.

Como medir corretamente:
1. Abra o endereço no Chrome do Redmi 13C com conexão estável.
2. Mantenha a tela visível durante todo o teste, sem trocar para outros aplicativos.
3. Faça o teste com bateria suficiente e sem modo de economia de energia; aguarde o aparelho esfriar se estiver quente.
4. Clique em INICIAR COMPARAÇÃO NO CELULAR e deixe as 10 etapas concluírem.
5. Use COPIAR RESULTADO e cole no ChatGPT, ou compartilhe o texto.

**Interpretação:** uma diferença positiva indica melhoria observada naquela sessão; uma diferença negativa mostra regressão. Se os dois modos baterem no limite de atualização da tela, é normal a diferença ser próxima de zero. O benchmark mede quadros desenhados no navegador; não mede FPS de codificação do TikTok, consumo de bateria ou performance do jogo em segundo plano. A qualidade adaptativa também pode levar alguns segundos para responder à queda. A medição não substitui observação visual das animações no aparelho.

O Github Actions usa somente um teste acelerado em localhost para verificar se o benchmark funciona; **o resultado dessa simulação não deve ser apresentado como FPS real do Redmi**. O jogo continua em pré-lançamento, sem eventos TikTok reais.
