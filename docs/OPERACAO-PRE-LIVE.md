# Operação e critérios de lançamento — Corrida dos Elementos LIVE

Atualização: 4 de novembro de 2026. Este documento descreve o que está implementado, não uma garantia de transmissão real.

## 1. Arquitetura em funcionamento

- **Servidor**: Node.js no Render, fonte única do estado e ranking, atualizações SSE /api/stream e fallback HTTP /api/state.
- **Banco**: PostgreSQL no Render, snapshot de rodada, fila, resultados e campeonato. Sem DATABASE_URL o jogo é apenas demonstração volátil.
- **Mundo 3D**: Floresta e Gelo, pista oficial de 5.000 m e dois segmentos reutilizáveis somando 600 m de objetos WebGL; duração máxima de 25 minutos.
- **Corredores**: até 50 por corrida, apresentação vertical 9:16, motor separado da taxa de FPS do navegador e opção de perfil Leve.
- **Inscrições**: somente o comentário exato "entrar", uma vez por ID na rodada, inscrição tardia na rodada seguinte, sem reinscrição automática.
- **Presentes**: efeito com limite de um turbo de 4 s por rodada; eventos de teste têm rótulo explícito.
- **Curtidas**: pacotes são agrupados por cerca de 2 s, IDs repetidos são rejeitados quando disponíveis e só a contagem agregada é publicada. Não dão vantagens, não inscrevem automaticamente nem identificam quem curtiu.
- **Conector**: biblioteca não oficial tiktok-live-connector, desligada por padrão no pré-lançamento. Eventos reais não foram validados.
- **Vídeo**: não há transmissor de vídeo RTMP embutido. O jogo é uma fonte visual para captura por equipamento/serviço autorizado.

## 2. Páginas de uso

- Tela da transmissão: https://corrida-dos-elementos-live.onrender.com/?view=live
- Operador: https://corrida-dos-elementos-live.onrender.com/?view=operator
- Diagnóstico de FPS no Android: https://corrida-dos-elementos-live.onrender.com/?view=live&quality=low&debug=1
- Benchmark local de 5 km: https://corrida-dos-elementos-live.onrender.com/benchmark.html
- Estado público do motor: https://corrida-dos-elementos-live.onrender.com/health

O painel de operador exige ADMIN_KEY para alterar o estado compartilhado. **Não coloque a chave em links, prints, chat ou repositório**. O painel não armazena a chave permanentemente.

## 3. Sequência de QA antes de ativar a LIVE real

1. Confirmar os dois workflows no GitHub: **Verificar motor da corrida** e **QA visual Android — sem LIVE real** aprovados no commit publicado.
2. No Redmi 13C, abrir a tela vertical com perfil Leve; conferir câmera, corredores, resolução, visibilidade do ranking e objetos no trecho de chegada de 5.000 m.
3. Rodar benchmark Android para Gelo e Floresta no percurso de 5 km. FPS em testes anteriores de 300 m não prova FPS de 5 km.
4. No painel privado, simular diversas inscrições "entrar", duplicatas e inscrições durante corrida e conferir fila seguinte.
5. Simular presente e 10 curtidas. Verificar que o painel indica [TESTE] e não soma curtidas reais.
6. Consultar recuperação do PostgreSQL. Confirmar rodada salva, deploy, retomada da mesma rodada e persistência após reinício.
7. Validar conectividade e reconexão com outro navegador no modo espectador.
8. Configurar captura autorizada do vídeo e validar som/imagem e enquadramento 9:16 em transmissão privada/de teste permitida.
9. Só com a autorização do operador, ativar TIKTOK_LIVE_MODE=enabled e TIKTOK_USERNAME no Render; validar primeiro comentário real sem presente comprado. O jogo **não inicia uma LIVE** sozinho.
10. Verificar o plano de hospedagem para garantir execução continuada. Render Free pode suspender e não atende à exigência de 24h ininterruptas.

## 4. Banco e infraestrutura

Em 4/11/2026 o banco gratuito vinculado ao projeto estava disponível, porém com vencimento em **4/12/2026 (UTC)**. O plano gratuito não oferece backup gerenciado nem garantia de preservação após expiração. Migrar os dados e atualizar DATABASE_URL antes da data; não apagar o banco antigo até verificar a restauração.

Manter ADMIN_KEY e DATABASE_URL somente nas variáveis privadas do Render. Nunca habilitar conexões externas ao banco apenas para diagnóstico. O serviço deve falhar na inicialização se DATABASE_URL estiver configurada mas a conexão não puder ser estabelecida, em vez de criar um estado alternativo na memória.

## 5. Critérios que não podem ser alegados antes de prova

- "Conectado ao TikTok": exige conexão real e evento recebido, não basta a variável existir.
- "24 horas sem interrupção": exige hospedagem que permaneça ativa, teste de longa duração e ferramenta de vídeo.
- "50 corredores a 60 FPS no Redmi": exige medição no aparelho físico, não apenas Chromium headless.
- "Ganhos financeiros por presentes": somente após conferência dos dados oficiais; o jogo não faz contabilidade financeira.

O lançamento completo depende dessas validações e da infraestrutura externa. Até lá, a aplicação é um jogo 3D funcional com simulação e backend persistente, em pré-lançamento.
