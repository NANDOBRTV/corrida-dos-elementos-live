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
