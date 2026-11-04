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
