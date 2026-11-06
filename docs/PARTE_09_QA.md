# Corrida dos Elementos LIVE — Parte 9/10: QA 9:16 e carga

## Escopo

Esta parte acrescenta testes para o HUD vertical de 1080×1920, uma simulação de
Android intermediário em 360×800, renderização de 100 corredores, FPS, câmera
única, limites de GPU, recuperação do navegador e integridade do motor.

**Importante:** emulação no Chromium não é medição num Redmi 13C físico. A
transmissão real, chave de streaming e disponibilidade contínua no Render não
são ativadas por estes testes. A branch `studio-v5-live-9x16` permanece separada
da versão pública em `main`.

## Arquivos

- `e2e/studio-v5-hud-performance.spec.mjs`: valida safe zones de 120 px no topo
  e 220 px embaixo (proporcionais), ausência de scroll e interseções entre
  painéis, 100 corredores, uma câmera e menos de 30 draw calls; registra PNGs
  e JSONs com métricas e FPS de quadros do navegador.
- `tests/studio-load.test.mjs`: motor determinístico com 100 corredores em
  1000 m, 1200 m e 1500 m; trajetória e câmera finitas, ranking sem perdas
  e resultado idêntico com a mesma semente.

## Executar na branch de desenvolvimento

```sh
npm ci --include=dev
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

Os testes do navegador exigem acesso ao módulo Three.js servido pelo CDN do
`index.html`. Os resultados são encontrados em `test-results` e nos artefatos
do GitHub Actions. O FPS do Chromium headless é apenas indicador comparativo;
se quiser usar um limite na sua infraestrutura de QA, defina por exemplo
`STUDIO_MIN_FPS=20` antes de `npm run test:browser`. Sem essa variável,
o teste registra o FPS medido, mas não afirma que o hardware do espectador
alcança um valor mínimo.

## Critérios de aceite

1. `npm run check` e `npm test` sem falhas.
2. Playwright sem exceções de página; imagens nos dois tamanhos e relatórios
   JSON anexados. Nenhum painel fixo fora das áreas seguras ou sobreposto aos
   demais painéis fixos.
3. Em cena: 100 corredores, uma câmera, menos de 30 draw calls, menos de
   55 mil triângulos. Sem erros detectados no watchdog.
4. Motor: distâncias finitas, ranking com 100 IDs únicos e mesmo resultado
   quando a semente e as entradas são repetidas.
5. Inspeção visual humana das capturas para textos pequenos, legibilidade,
   cores, recortes e sobreposições com elementos animados.
6. Teste no Redmi 13C físico, OBS e conta de transmissão autorizada antes da
   publicação em produção. Teste em hardware real ainda é pendência.

## Próximo passo — Parte 10

Realizar teste ponta a ponta, persistência depois de reinício, proteção das
APIs administrativas e revisão final do lançamento; sem credenciais no
repositório ou nos arquivos de transmissão.
