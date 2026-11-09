# Narrador esportivo automático — Corrida dos Elementos LIVE V5

## Como funciona
A narração foi integrada ao modo **Studio V5**, que já exibe o jogo em formato vertical 9:16. Ela é totalmente baseada no estado da corrida, sem gerar espectadores, interações ou resultados inventados. Quando ativada, acompanha **todas as rodadas seguintes** sem reiniciar o botão:

- Anuncia a abertura de inscrições, mudança de bioma e preparação do grid.
- Anuncia os 3 segundos finais de largada, a saída do pelotão, os carros em destaque e quem lidera.
- Reconhece trocas reais na primeira posição e turbina o tom da locução.
- Comenta efeitos e poderes do jogo que realmente apareceram no estado oficial.
- Anuncia reta final, bandeirada, vencedor e os demais colocados no pódio.
- Varia frases periodicamente com intervalos para não falar sem parar.
- Lê o nome/modelo do competidor de forma higienizada, em português brasileiro.
- O texto é mostrado em legenda visível sobre a pista; o botão de áudio fica na lateral.
- Todas as falas são locais ao navegador. O jogo continua idêntico no servidor.

## Iniciar no Android
1. Abra a [prévia V5](https://corrida-elementos-v5-preview.onrender.com/?view=live&studioPreview=1&quality=low&crowd=20) **depois de o novo commit ter sido implantado**.
2. Toque no botão **🎙️ ATIVAR NARRADOR**. Navegadores móveis normalmente exigem um toque para permitir som.
3. A tela mostra **🎙️ NARRADOR LIGADO** e uma primeira frase de teste. Ajuste o volume de mídia do aparelho.
4. As falas seguem o jogo enquanto a guia está ativa. O mesmo botão desliga a narração e interrompe a voz imediatamente.
5. Abra a tela no **Chrome Android** para obter a voz em português mais adequada instalada no dispositivo.

O jogo procura uma voz **pt-BR** e prefere vozes naturais/neuronais quando presentes. Caso não exista tal voz, tenta usar a voz padrão do sintetizador configurada para pt-BR. **O timbre não é garantidamente de estúdio**: é produzido pelo mecanismo nativo do aparelho, sem créditos pagos de IA.

## Transmissão no OBS e TikTok
- A narração é local ao dispositivo que abriu a fonte V5. Para transmitir o áudio, **confirme que a fonte de transmissão está capturando essa saída**, além do vídeo.
- Algumas instalações do OBS/CEF não gravam sons de `speechSynthesis` quando a opção **Controlar áudio via OBS** está ativa. Teste a captura de áudio da sessão; caso a fonte não capture, capture a saída de áudio do navegador/sistema ou evolua para clipes de áudio gravados servidos como `<audio>`.
- Se a fonte navegador atualizar ou dormir, o sintetizador poderá exigir nova ativação manual. Não prometa narração autônoma 24 h com Render Free.
- Este recurso não abre LIVE, não aciona `tiktok-live-connector` e não exige login nem credenciais de plataformas.
- Não use o volume do narrador como prova de que o som está chegando ao público: confira no medidor e na gravação-teste autorizada.
- O Render Free não garante transmissão 24 h; a prévia é demonstrativa e não substitui operação real.

## Arquivos, testes e diagnóstico
- `src/studio-commentary.js`: direção narrativa determinística, seleção de voz brasileira e controle limitado da fila.
- `src/studio-ui.js`: botão, legendas, sincronização com o estado oficial e limpeza ao sair da página.
- `assets/studio-live.css`: controles visuais e legendas compatíveis com 9:16.
- `tests/studio-commentary.test.mjs`: eventos de rodada, mudança de líder, resultado, prioridades e mute.
- `e2e/studio-vehicles.spec.mjs`: teste de ativação, texto de legenda e desativação da voz no navegador.
- Na prévia (nunca na LIVE pública), `window.__studioV5Debug.getNarratorState()` mostra o status do narrador; não contém informações privadas.

**Pré-lançamento:** o código na branch V5 não altera automaticamente a produção `main`. A prévia Render usa autodeploy desligado e somente recebe a novidade após um deploy controlado. Validar Android físico e áudio OBS antes de ativar qualquer transmissão externa.
