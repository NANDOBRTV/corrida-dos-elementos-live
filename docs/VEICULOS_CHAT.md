# Corrida dos Elementos LIVE — 30 modelos selecionados pelo chat

Implementação no Studio V5. **20 carros e 10 motos**, sem sorteio de veículos para espectadores reais.

## Como participar

O participante escreve exatamente o modelo escolhido, com ou sem o prefixo `entrar`:

- `Civic` ou `entrar Civic`
- `Uno` ou `entrar Uno`
- `Strada` ou `entrar Strada`
- `CG 160` ou `entrar CG 160`
- `XRE 300` ou `entrar XRE 300`

Também são aceitas maiúsculas/minúsculas e alguns apelidos cadastrados como `cg160`, `s-10`, `twister` e `scada` (Strada). Mensagens arbitrárias são ignoradas.

## 20 carros

Civic, Gol, Uno, Strada, Palio, Corsa, Onix, HB20, Corolla, Fiesta, Ka, Saveiro, S10, Hilux, Duster, Renegade, Fusca, Monza, Opala, Santana.

## 10 motos

CG 160, Biz 125, Bros 160, XRE 300, Pop 110i, Fazer 250, CB 300F Twister, Factor 150, Lander 250, NMAX 160.

## Regras

- Os participantes reais precisam digitar um dos 30 modelos válidos.
- Cada conta tem uma inscrição na rodada; dois participantes podem escolher o mesmo modelo.
- A escolha fica registrada no estado de corrida, no ranking, no pódio e na próxima fila.
- Quem se inscreve quando a corrida já começou entra na próxima rodada.
- O nome exibido é o **modelo do veículo**, não o nome do perfil.
- Há apenas uma cena 3D, com modelos voxel originais em lote (até 100 veículos); rodas animadas e inclinação sutil para motos.
- Os bots da prévia mostram os 30 modelos em uma sequência fixa de dois carros e uma moto. **Isso não é o mecanismo de escolha dos espectadores reais.**
- Sem nomes ou logos oficiais estampados nas malhas; nomes de modelo são usados apenas como identificação.
- A conexão real com o chat continua condicionada à ativação autorizada do conector de transmissão.

## Testar no Android, sem LIVE real

Prévia (20 veículos iniciais):
https://corrida-elementos-v5-preview.onrender.com/?view=live&studioPreview=1&quality=low&crowd=20

Na prévia, toque **ENTRAR**, digite um modelo e confirme. A demonstração troca um bot pelo veículo escolhido durante a inscrição. Na corrida em andamento, a escolha entra na fila seguinte. Isso não representa uma mensagem real de uma plataforma de transmissão.

Frota completa (100 veículos):
https://corrida-elementos-v5-preview.onrender.com/?view=live&studioPreview=1&quality=low&crowd=100

## Testes

- `tests/studio-vehicles.test.mjs`: quantidade de modelos, aliases, escolha não aleatória, duplicação por modelo, limite por conta, fila seguinte, pódio e API do chat pseudônimo.
- `e2e/studio-vehicles.spec.mjs`: 30 veículos distintos em cena, capacidade de 100, placas/ranking e teste de seleção manual.
- Verificar `npm run check`, `npm test` e `npm run test:browser` antes de publicar a versão para espectadores reais.

**Operação:** não colocar a branch V5 na produção ou habilitar conexão real de chat sem verificar os segredos, banco, dispositivo físico e permissão da plataforma.
