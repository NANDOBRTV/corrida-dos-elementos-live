# Motor remoto no Render — Corrida dos Elementos LIVE

## O que o servidor faz

O Node.js em **server/index.js** executa uma corrida mesmo quando nenhum celular está exibindo a arena. Ele controla fases, inscrições (simuladas), ranking, obstáculos, turbo e rodadas. O navegador abre a página servida pelo Render e recebe atualizações por **Server-Sent Events (SSE)**. A hospedagem no GitHub Pages continua como demonstração local, sem backend compartilhado.

O servidor expõe estas rotas:

| Rota | Tipo | Acesso |
|---|---|---|
| / | GET | Jogo com cena 3D, interface e SSE |
| /health | GET | Diagnóstico de serviço |
| /api/state | GET | Estado oficial somente leitura |
| /api/stream | GET | Atualização em tempo real, somente leitura |
| /api/admin/join | POST | Inscrição simulada, requer X-Admin-Key |
| /api/admin/action | POST | pause, resume, advance, turbo, add-demo, reset; requer X-Admin-Key |

O motor não recebe eventos reais do TikTok, não transmite vídeo/RTMP e não opera um Android virtual. Ele apenas mantém **o estado do jogo em execução** enquanto o processo Node.js estiver ativo.

## Implante sem cobrança de computação inicial

O repositório contém render.yaml para criar o serviço na modalidade gratuita. Na sua conta Render:

1. Conecte o repositório https://github.com/NANDOBRTV/corrida-dos-elementos-live.
2. Selecione Web Service, ambiente **Node**, branch **main**, região **Ohio**, plano **Free**.
3. Build command: npm install --omit=dev && npm run check && npm test
4. Start command: npm start
5. Configure **ADMIN_KEY** com um token longo e imprevisível no painel Environment. Não coloque o token no GitHub. Opcionalmente use um Blueprint, que gera o token automaticamente.
6. Deploy. Depois abra a URL HTTPS que Render mostrar e verifique /health.
7. No jogo, cole ADMIN_KEY no painel de operador somente quando quiser simular inscrições/ações.

O Render pode exigir autorização para vincular o repositório à conta. **Jamais compartilhe o token em print ou commit.** Use chaves únicas para cada serviço.

## O que significa “24 horas”

- **Render Free:** suspende o serviço após cerca de **15 minutos sem tráfego recebido**. O jogo para enquanto o serviço está suspenso. Ao receber um novo acesso, o Render pode demorar aproximadamente um minuto para retomar. Também há cota compartilhada de 750 horas gratuitas/mês e outras limitações. **Não há promessa de 24h gratuitas**.
- **Render Starter (serviço pago, atualmente cerca de US$ 7/mês):** não suspende por inatividade e é a opção indicada para o motor continuar correndo quando a tela está fechada. Ainda pode haver reinicializações/deploys e indisponibilidade eventual; não há garantia absoluta.
- **Banco de dados:** na modalidade somente memória, todas as inscrições/resultados existentes são perdidos ao reiniciar o processo. Para persistência durável, crie um banco persistente e configure DATABASE_URL no Render. O módulo server/storage.js criará a tabela elemental_game_state automaticamente. O Postgres Free do Render expira após 30 dias e não deve ser considerado armazenamento permanente.
- **Sem sinal de vídeo:** ter o jogo online é diferente de transmitir 24h no TikTok. Para LIVE contínua, é preciso um codificador/streamer ou infraestrutura RTMP autorizada, além de acesso RTMP na conta TikTok.

Evite usar robôs que forcem tráfego só para impedir a suspensão do plano gratuito: isso não torna a implantação confiável e pode esgotar cotas.

## Testes e segurança

A autenticação protege apenas ações administrativas do servidor. Qualquer pessoa pode visualizar o jogo e o estado oficial. CORS não é aberto para gravar no servidor; chamadas com X-Admin-Key exigem HTTPS em produção. O token não é persistido pelo navegador nem enviado em URL. Se ele estiver vazio, todas as rotas administrativas ficarão bloqueadas.

Antes de considerar uma versão 24h aprovada, teste o endpoint /health, a página do jogo, a transição de rodadas sem navegador aberto e a persistência após redeploy. Monitore os logs, uso de memória, bandwidth e alertas no dashboard Render.

Atualizações automáticas: push na branch main pode iniciar novo deploy no serviço Render, conforme a opção Auto Deploy.
