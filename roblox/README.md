# Integração de avatares reais: Roblox Studio

O projeto web **não contém ativos ou modelos oficiais Roblox**. Esses scripts são feitos **somente para uma experiência Roblox**, usando as APIs nativas de criação de avatares. A tela no Render seguirá com modelos próprios, mesmo quando reconhecer um nome Roblox.

## Funcionamento

1. Um espectador envia `entrar NomeExatoDoRoblox` no TikTok. Para testes sem LIVE, envie esse texto no painel administrativo do Render.
2. O backend consulta `users.roblox.com/v1/usernames/users` e associa o **ID da conta** ao corredor. O nome precisa existir. Escolher um nome público **não prova que o espectador seja dono dessa conta**.
3. Um servidor de experiência Roblox acessa `/api/roblox/participants` com chave privada de integração (independente da ADMIN_KEY).
4. Dentro do Roblox, `Players:CreateHumanoidModelFromUserIdAsync` cria o avatar real, com a aparência pública atual permitida pela plataforma. O script atualiza o progresso conforme o motor de 400 metros por volta.
5. A câmera espectadora segue os corredores para possível captura de vídeo por ferramenta autorizada.

## Instalação (precisa de Roblox Studio no computador)

- Copie `LiveRace.server.luau` para um **Script** em **ServerScriptService**.
- Copie `LiveCamera.client.luau` para um **LocalScript** em **StarterPlayer > StarterPlayerScripts**.
- Em **Game Settings > Security**, habilite **Allow HTTP Requests**.
- Crie um segredo privado Roblox chamado `RACE_BRIDGE_KEY` e configure no Render a variável `ROBLOX_BRIDGE_KEY` com o mesmo valor. Não escreva chaves dentro dos arquivos.
- Teste com conta de teste real e com a LIVE desativada. Rode o serviço Render normalmente para manter o banco.
- Para transmissões TikTok é necessária captura/autorização de vídeo, além de infraestrutura estável. O Render não emite vídeo RTMP.

Sem Roblox Studio e uma experiência configurada, a parte de avatares 3D oficiais **não vai aparecer na tela web**. Os scripts ainda exigem testes em Studio e ajuste de animações para 50 personagens reais.

## Segurança e propriedade

- Não cadastre cookies de sessão `.ROBLOSECURITY`, senha Roblox ou token pessoal no GitHub.
- Não habilite o endpoint Roblox em produção sem `ROBLOX_BRIDGE_KEY` longa e aleatória.
- O serviço não usa itens Roblox fora dos serviços Roblox. Consulte as licenças antes de publicar.
- Se quiser garantir que a pessoa é dona do avatar, utilize autorização Roblox adequada em vez de confiar apenas em um comentário do TikTok.

O script server também gera uma pista 3D leve, com **Gelo e Floresta**, árvores de blocos e apenas 400 metros do circuito W reutilizados a cada volta, seguindo a ideia da versão WebGL. Os modelos reais são criados exclusivamente dentro do Roblox; a animação avançada ainda precisa ser validada no Studio.

## Versão 4.0 — W e voltas
O script server e a câmera de espectador usam a mesma lista de pontos e a mesma interpolação Catmull-Rom do jogo web. Cada volta mede 400m, com sinalização aos 100, 200 e 300m e pórtico aos 400m. O progresso total de voltas continua vindo do servidor Render; a posição física da câmera e dos NPCs usa a distância módulo 400. As mudanças de veículos após presentes são incluídas no feed privado. Estes scripts continuam **sem validação em um Roblox Studio real**.

## Versão 4.1 — alinhamento opcional da largada nativa
A ponte envia a posição de cada corredor para cinco fileiras de dez avatares, utilizando as dez faixas do circuito web (centros separados por 1,75 studs). A câmera Roblox Studio apresenta a grade frontal no lobby e na contagem e corta diretamente para trás no começo da corrida. Os closes continuam durante a prova. São scripts sincronizados **no repositório**, ainda não executados nem validados em uma experiência Roblox Studio real.
