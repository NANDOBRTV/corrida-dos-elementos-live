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

## Estado da implantação e próxima ativação

O projeto pode funcionar em três níveis separados:

1. **Render Free + memória:** demonstração com motor próprio enquanto a instância não estiver suspensa; estado perdido em reinícios.
2. **Render + PostgreSQL:** mantém fila/rodada no armazenamento entre reinícios, mas o motor não avança enquanto o serviço está suspenso. Configure a variável `DATABASE_URL` no serviço web com a **Internal Database URL** exibida na página do seu banco no Render (mesma região). Nunca coloque o valor em código ou envie por chat.
3. **Render Starter + PostgreSQL:** instância paga não suspende por inatividade; o motor pode continuar com o celular fechado. Reinícios ocasionais são possíveis e os dados sobrevivem somente quando `DATABASE_URL` estiver configurada corretamente.

Um PostgreSQL Free do Render expira em 30 dias e não possui backups gerenciados. Agende migração para uma solução durável antes da data de expiração.

## TikTok LIVE — conector opcional preparado

Foi adicionado o módulo `server/tiktok.js`, que usa a API moderna de `tiktok-live-connector`, versão 2.5.0. O conector **fica desativado por padrão**.

Para habilitar, cadastre na área Environment do serviço Render a variável `TIKTOK_USERNAME`, com o @identificador de uma conta que você tem autorização para acompanhar. Reinicie/deploy o serviço. Durante uma LIVE ativa, o módulo tenta conectar e encaminha comentários que sejam exatamente `entrar` ao motor autoritativo. O identificador estável é lido de `event.user.id`; o texto é lido de `event.content`. Sem ID confiável, a inscrição é ignorada. Uma conexão falha tenta se recuperar com intervalo progressivo.

Em `/health`, o servidor informa `tiktokEnabled` e `tiktokConnected`. A existência do código não comprova que houve conexão real. Só considerar integração validada se `tiktokConnected: true` durante uma LIVE e uma inscrição real aparecer na rodada correta.

Esse conector é **não oficial** e depende de API de assinatura externa; pode sofrer limitações ou mudanças de protocolo. Ele **não cria LIVE nem envia vídeo** para TikTok. O endereço RTMP ou a transmissão contínua são problemas separados do recebimento de comentários.

Para desabilitar o conector, apague `TIKTOK_USERNAME` do ambiente do serviço. Não escreva senhas, cookies, tokens ou chaves da conta em um repositório público.

## ADMIN_KEY

A variável `ADMIN_KEY` é exigida pelo painel administrativo. Ela fica em **Render → Web Service → Environment**. É uma credencial sensível; nunca compartilhe prints que a mostrem, não a armazene no navegador e não a inclua no repositório.

## Presentes TikTok e efeito de corrida (Fase 3)

O conector agora reconhece eventos reais de presente emitidos pelo TikTok LIVE, separadamente dos comentários. Para presentes com sequência (**streak**, gift.type=1), ele **aguarda o evento final** (repeatEnd=1) antes de contar. Isso evita que o contador cumulativo da sequência aplique o mesmo presente repetidamente. Para presentes simples, cada evento completo pode ser contabilizado individualmente. Uma janela de deduplicação por groupId ou msgId reduz repetições da rede.

**Balanceamento deliberado:** um participante que já está correndo recebe apenas **um turbo de quatro segundos por rodada**, independentemente do valor do presente ou da quantidade enviada. Presentes extras recebem agradecimento visual, sem acumular vantagens. Presentes enviados por espectadores fora da corrida não inscrevem automaticamente ninguém; é preciso escrever **entrar** no chat para participar.

Na própria interface, o operador pode pressionar **🎁 SIMULAR PRESENTE**. No Render, o controle exige ADMIN_KEY. Os presentes simulados são identificados como teste e não representam presentes reais nem receita.

O servidor transforma o identificador TikTok em uma pseudônimo estável com HMAC antes de armazená-lo e compartilhá-lo em /api/state ou SSE. A chave deriva de ADMIN_KEY ou, se você configurar, TIKTOK_ID_SALT. Não divulgue essas variáveis. Se trocar a chave, o mesmo espectador receberá um novo ID interno até se inscrever novamente.

Os eventos dependem do conector TikTok **não oficial** e ainda não foram validados em uma transmissão real de @nandobr_ofc. Sem LIVE ativa, a conexão permanece indisponível e o servidor segue controlando as rodadas de teste.

**Atenção:** o Render Free ainda suspende por inatividade. O código de presentes não remove esse limite nem cria vídeo/RTMP 24 horas.


## Diagnóstico privado do chat TikTok — versão 1.4

Na URL do Render, abra o Painel do Operador, preencha **ADMIN_KEY** e toque em **📡 VERIFICAR CHAT E PRESENTES REAIS**. A consulta acessa **GET /api/admin/diagnostics** e exige o mesmo token dos demais controles. Ela não está disponível para visitantes não autenticados.

O relatório mostra:

- Tentativas de conexão com o chat, horário da última conexão confirmada e motivo genérico da indisponibilidade (por exemplo, **live_not_active**).
- Total de comentários observados, comandos **entrar** reconhecidos, inscrições aceitas e inscrições rejeitadas.
- Eventos de presentes observados, presentes de sequência finalizados, presentes processados, duplicações evitadas e turbos aplicados.
- Presentes **simulados**, contados separadamente dos presentes reais.
- Rodada atual, fase, corredores inscritos, fila seguinte, espectadores com SSE e estado do PostgreSQL.

**Os contadores começam do zero a cada reinício do processo Render.** Não são estatísticas históricas do TikTok e não ficam salvos no banco; são apenas diagnósticos para testar a integração. O motor e as inscrições, por outro lado, usam o PostgreSQL quando configurado.

Os contadores não guardam texto de comentários, IDs privados, cookies ou tokens do TikTok. As ações de simulação não aumentam os contadores de comentários/presentes reais, evitando diagnósticos enganosos.

**Como validar com uma LIVE verdadeira:** inicie uma transmissão usando a conta **@nandobr_ofc**, abra a arena Render em outro navegador, aguarde o status de conexão e envie **entrar** usando uma conta espectadora. Consulte o relatório e confira o aumento dos campos de comentários e inscrições. Teste primeiro o botão de presente fictício; a validação de presente real é opcional e não exige realizar uma compra apenas para testar.

O Render Free pode adormecer após inatividade; o botão de diagnóstico **não transforma** o plano gratuito em serviço ininterrupto 24h. Ainda será necessário hospedagem não suspensível para essa garantia operacional.
