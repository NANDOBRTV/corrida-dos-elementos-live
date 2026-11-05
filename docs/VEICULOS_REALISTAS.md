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
