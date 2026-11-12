# Veículos mais realistas — Studio V5

## Objetivo entregue

A visualização dos **20 carros e 10 motos** foi aprimorada sem substituir o cadastro de modelos ou alterar as regras de inscrição pelo chat.

Os carros usam carroceria arredondada de múltiplos anéis com geometria 3D real, janelas inclinadas, vidros escurecidos, teto pintado, pneus cilíndricos, rodas com centros metálicos, faróis dianteiros e lanternas traseiras. As proporções diferenciam sedan, hatch, compacto, picape, SUV, clássico e muscle.

As motos usam duas rodas redondas, tanque arredondado, guidão e assento; **toda moto na pista tem um piloto 3D com capacete, viseira, jaqueta, braços conectados ao guidão, pernas, luvas e botas**, que acompanha a inclinação do veículo. Carros não recebem pilotos externos.

## Arquitetura

- src/studio-vehicle-models.js: gera superfícies e cabine com BufferGeometry e as renderiza via THREE.InstancedMesh. Material físico com roughness/metalness oferece contraste de pintura, cromados, borracha e vidro. Instâncias usam paleta por usuário para distinguir modelos repetidos.
- src/studio-scene.js: integra o novo módulo; mantém pequenos detalhes voxel e remove os blocos grandes de carroceria, as janelas quadradas e os antigos cubos usados como pneus. Desenha cena inteira com uma câmera.
- O estado, as inscrições e o ranking **continuam independentes da geometria**. vehicleId permanece o escolhido via chat, sem sorteio.

## Escala e desempenho

- Até 100 veículos simultâneos.
- Carros: 4 rodas; motos: 2 rodas + 1 piloto.
- Geometrias e materiais compartilhados entre instâncias (sem rede de modelos 3D).
- Qualidade reduz automaticamente em dispositivos lentos.
- Os testes devem confirmar realCarModels, realMotorcycleModels, motorcycleRiders e realWheels retornados em scene.stats().

## Limite de fidelidade visual

As malhas são **originais e geometricamente mais realistas**, mas **não são CADs oficiais nem reproduções fotográficas exatas** de cada versão/ano do Civic, Uno, Gol, Strada etc. Para fidelidade 1:1 de carrocerias específicas seriam necessários modelos 3D de cada versão, com autorização/licença de uso e otimização para dispositivos móveis.

## QA

- npm run check && npm test
- npm run test:browser: WebGL/Android emulado, até 100 veículos, rodas e pilotos; 9:16.
- Validar manualmente no aparelho físico antes da LIVE real.

A produção main não recebe estas mudanças até revisão do PR V5.


## Atualização 06/11/2026 — pilotos articulados e memória controlada

- Todas as **10 motos** usam piloto procedural com capacete arredondado, viseira, jaqueta de torso afunilado, proteção de pescoço, cotovelos e joelhos com duas peças por membro. Cada piloto é composto por **8 segmentos articulados** de braços e pernas, mais mãos e botas.
- A geometria usa os mesmos `THREE.InstancedMesh` já existentes: mesmo número de categorias de chamadas GPU, sem criar um objeto WebGL por membro ou depender de download remoto.
- `scene.stats().riderLimbSegments` permite verificar o total de segmentos desenhados (10 motos = 80; 100 motos = 800).
- Os veículos com GLB premium (Fusca, Uno, Palio e Civic) usam cache de clones limitados a no máximo 12 por cena, reutilizado entre closes. Esse cache não limita a quantidade de participantes: pode haver 100 veículos, mas só os focalizados carregam alta fidelidade ao mesmo tempo.
- `scene.stats().premiumCachedVehicles`, `.premiumCacheLimit` e `.premiumActiveVehicles` permitem acompanhar objetos detalhados. O cache retira clones fora de foco, sem liberar as geometrias e texturas compartilhadas que ainda estão em uso.
- O Gol e o Opala continuam com silhuetas procedurais próprias; **não** são modelos GLB licenciados. Não confundir Gol com Golf. Modelos e artistas de terceiros precisam ter os créditos CC BY preservados.

### Prévia no celular

- [Modo leve com 20 veículos](https://corrida-elementos-v5-preview.onrender.com/?view=live&studioPreview=1&quality=low&crowd=20): indicado para inspecionar FPS no Android.
- [Modo ultra com seis carros especiais](https://corrida-elementos-v5-preview.onrender.com/?view=live&studioPreview=1&quality=ultra&crowd=6&hero=1): ideal para inspecionar GLBs e detalhes quando o dispositivo suportar. O modo ultra consome mais memória e GPU.
- A prévia é **separada da produção**. O seu deploy só contém os novos ajustes após publicar o commit correspondente no serviço Render de homologação. Esse modo não cria participantes reais, não envia presentes e não transmite ao TikTok.

### Testes específicos

- `tests/studio-model-geometry.test.mjs`: catálogo de 20 carros, 10 motos e oito segmentos por piloto.
- `e2e/studio-vehicles.spec.mjs`: integridade dos pilotos, rodas, identificação e renderização até 100 veículos.
- `e2e/studio-premium-glb.spec.mjs`: cache limitado após mudanças de câmera com arquivos GLB licenciados.

A aprovação automática do Chromium não garante FPS no Redmi 13C físico. Não declarar operação 24 horas ou conexão LIVE real sem teste no hardware, banco persistente e transmissão autorizada.
