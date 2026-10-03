# Etapa 11 — revisão e estabilização

Revisão concluída sem implementar funcionalidades de Planta Geral ou alterar medidas para fechar a geometria. Projetos locais existentes foram preservados. As verificações combinaram testes automatizados do modelo e testes pela interface; a tabela distingue os dois.

## Problemas encontrados e corrigidos

| Problema | Correção e evidência |
| --- | --- |
| Duas chamadas simultâneas de flush podiam repetir uma gravação permanentemente falha em um ciclo de tentativas. | Chamadas concorrentes compartilham a tentativa; falha mantém dados e journal para nova tentativa explícita. Teste simula falha, chamadas concorrentes e recuperação. |
| O fallback em localStorage priorizava qualquer journal, mesmo anterior ao registro principal. | Compara as revisões por data, como já ocorre no IndexedDB. Testes com journal anterior e posterior. |
| Validação do banco conferia arrays, mas aceitava elementos nulos/malformados que poderiam falhar na interface. | Valida estrutura dos elementos, origens, contadores e relações antes da renderização. Dados incompatíveis não são sobrescritos; números medidos inválidos continuam disponíveis para o checklist. |
| Após excluir a parede A, a indicação da entrada ainda dizia A junto à primeira parede sobrevivente. | Usa a identificação da primeira parede atual, sem renumerar paredes ou alterar dimensões. |
| Formulário, croqui e checklist recalculavam separadamente a mesma geometria do ambiente selecionado. | `buildRoomGeometry` produz um resultado derivado compartilhado e memorizado. Teste compara projeções, avisos e completude com cálculo independente. Reservas de textos também são reutilizadas no SVG. |
| `updateRoom` copiava ramos não afetados mesmo quando o destino não estava neles. | Preserva referências de ramos não alterados, com teste de identidade e isolamento de subambientes. |
| Títulos do SVG combinavam múltiplos filhos de texto, incompatíveis com a renderização estática do React. | Títulos são strings únicas; teste de renderização confirma descrições de cantos, diagonal, aberturas e PI, inclusive entrada B após excluir A. |

TypeScript agora verifica também imports, variáveis e parâmetros não utilizados durante o build. Todas as dependências declaradas têm uso no aplicativo ou ferramentas de desenvolvimento; nenhuma dependência nova foi adicionada. Não houve grande refatoração estética de componentes/arquivos.

## Dados e geometria

Testes com dados congelados verificam ausência de mutação em geometria, anotações, checklist, relações e exclusão de parede. Valores com várias casas decimais, pé-direito, alturas, larguras, peitoris, posições, ângulos e diagonais foram preservados no armazenamento e na reabertura. Os textos podem ser arredondados para exibição; campos e registros originais não são substituídos por esses textos.

Geometria original e resultado de visualização continuam separados. Verificados retângulo, pentágono, hexágono, L com canto de 270°, 45°, 82°, ângulos presumidos/indefinidos/calculados, lei dos cossenos, conflitos, diagonais inválidas e fechamento. Na interface: diferença de 2,6 cm gerou aviso aproximado; diferença de 40 cm gerou “Verifique as medidas informadas”. Os comprimentos permaneceram exatamente nos valores digitados, sem bloqueio.

## Matriz dos 31 testes solicitados

Todos os casos abaixo passaram dentro do tipo de verificação indicado. “Automatizado” significa teste das funções/modelos, não uma sequência completa de cliques no navegador.

| Teste | Cenário | Verificação |
| --- | --- | --- |
| 1 | Criar projeto | Interface e modelo com IDs fallback |
| 2 | Criar pavimento | Interface e modelo |
| 3 | Criar ambiente | Interface e modelo |
| 4 | Criar subambiente | Interface e modelo |
| 5 | Retângulo de quatro paredes | Interface e `geometry.mjs` |
| 6 | Cinco paredes | `geometry.mjs`: pentágono |
| 7 | Seis paredes | `geometry.mjs`: hexágono e múltiplos segmentos |
| 8 | Ambiente em L | `geometry.mjs`: posições e canto reentrante |
| 9 | 45° | Interface e geometria automatizada |
| 10 | 82° | Interface e geometria automatizada |
| 11 | Geometria parcialmente definida por diagonal | Interface e cálculos automatizados |
| 12 | Fechamento com 2–3 cm de diferença | Interface: 2,6 cm; tolerâncias automatizadas |
| 13 | Grande inconsistência | Interface: 40 cm; avisos automatizados |
| 14 | Porta próxima ao canto | Interface: P01 a 2 cm de DA; posições automatizadas |
| 15 | Janela com dimensões, peitoril e posição | Interface: J01 120 × 100 cm, P=110; automatizado |
| 16 | Vão | Interface: V01; recorte automatizado |
| 17 | PI01 independente do perímetro | Interface e `internal-walls.mjs` |
| 18 | Sala/Banheiro com croquis próprios | Navegação desktop/mobile e testes de isolamento |
| 19 | Sala.P01 leva para Cozinha | Interface e relações automatizadas |
| 20 | Sala.P01 corresponde a Cozinha.P02 | Interface, persistência e relações automatizadas |
| 21 | Sala.C compartilhada com Cozinha.A | Interface e preservação de comprimentos automatizada |
| 22 | Renomear Cozinha para Cozinha Principal | Interface e IDs de relações automatizados |
| 23 | Excluir ambiente relacionado | Automatizado: limpeza de referências, relações e aviso técnico |
| 24 | Conferir no local | Interface e checklist automatizado |
| 25 | Medida duvidosa | Interface e checklist automatizado |
| 26 | Fechar e reabrir | Aba fechada/reaberta, mesma estrutura e campos |
| 27 | Atualizar página | Interface, IDs e campos comparados; edição imediatamente antes do debounce preservada |
| 28 | Layout mobile | 390/360 px: árvore, navegação, expandir/recolher e seleção da parede |
| 29 | Acesso pelo IP local | HTTP: nova entidade e medida restauradas após atualizar; sem tela branca |
| 30 | Sem crypto.randomUUID | `field-ux.mjs`: 5.000 UUIDs válidos e únicos; também 5.000 IDs únicos sem crypto |
| 31 | Entidades, relações e salvamento com fallback | `stabilization.mjs`: projeto/pavimento/ambientes/elementos/relações/revisões; HTTP real: nova entidade persistida |

## Responsividade e rede

| Dimensão | Overflow horizontal | Croqui |
| --- | --- | --- |
| 1920 × 1080 | Ausente | Sticky; SVG visível |
| 1366 × 768 | Ausente | Sticky; SVG visível |
| 768 × 1024 | Ausente | Fixo; SVG visível |
| 390 × 844 | Ausente | Mini persistente e expansão/recolhimento |
| 360 × 800 | Ausente | Mini persistente, expansão e seleção de parede |

O croqui com porta, janela, vão, PI e diagonal foi inspecionado visualmente no desktop e mobile. Valores ficaram próximos dos elementos e referências dos cantos permaneceram explícitas. Miniatura serve para acompanhamento; expandir melhora a leitura dos detalhes.

Conferidos `http://localhost:5173/`, `http://localhost:5174/` e `http://192.168.100.5:5174/`. O servidor de rede iniciado por `npm run dev -- --host 0.0.0.0` utiliza 5174 porque 5173 já estava ocupada. O teste de IP foi no navegador do computador, em HTTP, sem depender de randomUUID em secure context. Não houve mudança no firewall. Nenhum celular físico ou segundo dispositivo foi testado.

## Erros, persistência e autosave

- IndexedDB real: atualização, fechamento/reabertura da aba e preservação de dados antigos da origem localhost:5173 conferidos.
- Fallback localStorage: ida/volta, revisão mais recente, precisão e vínculos conferidos automaticamente.
- Debounce: 600 ms; múltiplas edições geram uma gravação final; escritas sequenciais; falha/retry e chamadas concorrentes testadas. O journal protege a alteração anterior ao fechamento/atualização imediatos.
- `tests/error-boundary.html`: falha real de renderização simulada em página isolada mostrou mensagem e botão de reabertura, sem acesso ao banco.
- `tests/load-error.html`: banco indisponível simulado mostrou erro de inicialização e botão de nova tentativa, sem acesso aos dados reais.
- Na abertura final e uso normal da versão concluída, o console da aplicação não registrou erros. Logs dos testes isolados de erro são esperados. Durante a troca dos contratos de componentes no desenvolvimento, o hot reload de uma aba antiga exigiu reabertura; a abertura final foi novamente testada.

## Limitações existentes

- O cálculo de diagonais resolve casos determinados e explica hipóteses; não é um solver geral de qualquer polígono. Não corrige automaticamente fechamento.
- Textos têm posicionamento por tentativa com reservas e linhas de chamada. Densidades arbitrariamente altas podem ainda causar sobreposição em um SVG fixo; não há garantia para qualquer quantidade de elementos. A miniatura mobile reduz a legibilidade de detalhes.
- Dados continuam por navegador/perfil/origem/dispositivo. IP, localhost e portas diferentes não compartilham banco. O servidor de desenvolvimento precisa continuar em execução para abrir a interface na rede.
- Não existe coordenação de edição simultânea em várias abas: prevalece a última gravação. O journal depende de localStorage disponível; sem ele, aguardar “Salvo” é essencial.
- Dados estruturalmente incompatíveis são preservados e não carregados; reparo/migração complexa não foi implementado. Não foi simulado desligamento abrupto do computador.
- Dispositivos físicos, teclado móvel, Safari/iOS e navegadores antigos não foram verificados. Não foi encontrado bloqueio específico de mobile/rede nos testes realizados.

## Preparação para futura Planta Geral

Já existem IDs estáveis, floorId/parentRoomId, croquis independentes, connectedRoomId/connectedOpeningId, referência de parede compartilhada, RoomRelationship e origem/relacionamento formal previsto no modelo de PI. A geometria derivada está separada das medidas, as tolerâncias estão centralizadas e o armazenamento possui schemaVersion. Essas estruturas são metadados; não há posicionamento, união, snap, rotação ou encaixe de ambientes implementados.

## Resultado final

`npm run build`: aprovado, TypeScript e Vite, sem erros.

`npm test`: aprovado, oito suítes: geometry, openings, internal-walls, relationships, checklist, persistence, field-ux e stabilization. Os contratos TypeScript dos modelos também são conferidos pela suíte de paredes internas.

Verificação adicional `tsc --noUnusedLocals --noUnusedParameters`: aprovada. Não foram adicionados backend, autenticação, exportações ou recursos da próxima fase.
