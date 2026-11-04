# Referência visual — corrida vertical estilo vídeo

Referência fornecida pelo usuário: gravação vertical de 66 segundos, 720×1280, mostrando uma corrida 3D voxel vista por trás, com pelotão de personagens variados, neve, ranking de cinco corredores, distância em metros, cronômetro, mini-mapa de progresso, mensagens de chat e eventos de sprint.

## Objetivo

Manter a identidade própria **Corrida dos Elementos LIVE**, com apenas **❄️ Gelo** e **🌲 Floresta**, e alcançar a mesma estrutura de jogo/transmissão em tela 9:16. Nenhum logotipo, nome comercial, personagem ou arte original de terceiros foi copiado.

## Implementado nesta fase (versão 2.4)

- Tela de transmissão ocupa a altura inteira do celular, com todos os widgets sobrepostos ao jogo.
- Câmera 3D seguindo o centro do pelotão por trás, em ângulo baixo e perspectiva de pista longa.
- Neve no Gelo e partículas vegetais na Floresta, em um sistema leve de pontos WebGL.
- Círculo de destaque no corredor mais adiantado.
- Ranking compacto, colorido, com posições, nomes e distâncias em metros.
- Cronômetro de corrida, distância restante e número de participantes, com mini-mapa progressivo.
- Evento de sprint mostrado somente quando o motor já informa turbo ativo.
- Nomes flutuantes com cor do avatar, mais participantes visíveis e uniformes personalizados.
- Mensagens sobrepostas **identificadas como eventos simulados**, sem falsificar comentários TikTok.
- Link de prévia: `/?view=live&showcase=1`. Gera 50 corredores falsos somente no navegador, não envia comandos de administrador e não altera o PostgreSQL ou partidas reais.
- Modo operador, autenticação, ranking, filas, presentes de teste, persistência, versões leves e adaptativas permanecem existentes.

## Ainda não implementado

- Cosméticos 3D personalizados como mochilas, veículos, motos, jatos e kart de verdade.
- Mini-mapa geográfico de curvas: o widget atual é indicador de progresso na pista reta.
- Transmissão 24/7 ou ingestão de eventos reais do TikTok.
- Identidade idêntica às figuras ou ao layout de marca do aplicativo mostrado no vídeo.
- Medição física de FPS no Redmi 13C depois dessa atualização (somente o navegador no aparelho pode medi-la).

## Verificações obrigatórias

- Testes Node.js, testes Chromium em 390×844 e 320×844; nenhuma barra horizontal ou vazamento de dados administrativos.
- Prévia com 50 competidores é visual/local, enquanto GET /api/state continua refletindo apenas o servidor.
- Gelo e Floresta continuam sendo os únicos biomas jogáveis.
- `TIKTOK_LIVE_MODE=disabled` no Render e sem teste de LIVE real.
- Publicação na main somente após pipelines aprovadas.

## Atualização 2.5 — detalhes da câmera, personagens e habilidades

- Personagens mais variados: chapéus, capuzes, mochila e tênis de corrida originais. As peças adicionais continuam dentro do mesmo lote WebGL instanciado; não são novos personagens nem itens vendáveis.
- Redução das etiquetas simultâneas durante a corrida para evitar que elas cubram toda a pista.
- Rastros luminosos 3D de turbo: um único lote WebGL com até três segmentos por corredor beneficiado. Eles aparecem apenas enquanto o motor de corrida confirma o efeito de turbo e desaparecem quando o tempo expira, sem modificar velocidade, dano ou regras.
- Mini-mapa verdadeiro da pista atual: linha reta com cinco raias, 0 a 150 metros, líder e dois perseguidores. Os pontos usam a posição oficial da corrida.
- Respeita a tela 9:16 a 320 e 390 px e conserva os dois biomas Gelo e Floresta.
- Esta fase **não** inclui kart, moto ou mochila a jato jogáveis, não ativa comunicação real TikTok e não garante FPS específico em aparelho físico. É necessária uma nova medição no Redmi 13C.
