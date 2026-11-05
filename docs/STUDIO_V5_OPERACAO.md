# Corrida dos Elementos LIVE — Operação Studio V5 (Parte 8/10)

## Isolamento e lançamento

A versão pública do Render permanece ligada à branch `main`. A nova interface 9:16 fica na branch `studio-v5-live-9x16` até completar os testes das Partes 9 e 10. Não faça merge nem habilite a LIVE real antes da validação. O arquivo `render.yaml` é a proposta de configuração; ele não muda automaticamente um serviço do Render já existente.

## Preparar Render

1. Abra o serviço `corrida-dos-elementos-live` no Dashboard e confira branch, build, start, health check, ambiente e deploy.
2. Configure `DATABASE_URL` apenas como variável secreta. Use armazenamento persistente confiável e faça backup; não dependa do filesystem efêmero.
3. Guarde `ADMIN_KEY` e `TIKTOK_ID_SALT` como segredos exclusivos; não exponha essas chaves em URLs, logs públicos, HTML ou no GitHub.
4. Em produção, deixe `STUDIO_V5_ENABLED=false` e `TIKTOK_LIVE_MODE=disabled` enquanto o QA estiver pendente.
5. Para homologação, crie uma instância separada ligada à branch V5 e a banco separado. Lá pode testar `STUDIO_V5_ENABLED=true` mantendo `TIKTOK_LIVE_MODE=disabled`.
6. Execute `npm run check` e `npm test` com Node.js 20+ antes do merge; aguarde a verificação de navegador e desempenho.

## Recuperação

- `GET /health`: saúde geral do servidor.
- `GET /api/studio/health`: saúde da V5 quando habilitada.
- `GET /api/studio/state`: snapshot da rodada.
- `GET /api/studio/events`: fluxo SSE, com reconexão no navegador.
- O watchdog em `src/studio-ui.js` confere a cada 5 segundos, reconhece congelamento de quadros por 30 segundos e ausência de atualizações por 45 segundos.
- São permitidas até 3 recargas em 15 minutos; guias ocultas e navegadores offline não são recarregados à força.
- No plano Free do Render, o servidor pode ser suspenso após 15 minutos sem tráfego de entrada. O watchdog do navegador **não garante** disponibilidade 24h.

## Fonte vertical para transmissão

1. No OBS ou software compatível, crie cena **1080 × 1920 (9:16)**.
2. Após aprovar e publicar V5, adicione uma fonte de navegador apontando para `https://corrida-dos-elementos-live.onrender.com/?view=live`.
3. Configure a fonte para **1080 × 1920** e inicialmente **30 FPS**; confira o enquadramento na prática.
4. Reserve aproximadamente 120 px acima e 220 px abaixo para sobreposições da plataforma; mantenha ranking e pista na área segura.
5. Não mostre o painel `?view=operator` nem credenciais de administração na LIVE.
6. Um telefone Android com Termux, sem chave RTMP ou serviço de captura em nuvem, não se torna uma instância de OBS 24h apenas por abrir essa URL.

## Falha e reversão

Desative `STUDIO_V5_ENABLED` no ambiente afetado, restaure um deploy estável se necessário e valide `/health`. Nunca substitua ou apague o banco de produção ao reverter a interface. Monitore erros, perda de rede, memória, FPS e reinícios durante o QA.

## Próximas entregas

**Parte 9:** testes reais de 100 participantes, FPS, renderização 1080 × 1920, Redmi 13C e HUD. **Parte 10:** integração ponta a ponta, persistência após reinício, segurança e liberação controlada. Esta Parte 8 prepara a operação, mas não certifica transmissão contínua.
