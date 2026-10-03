# Etapa 11 — testes obrigatórios

`npm test` executa as suítes legadas (`tests/*.mjs`) e, em seguida, esta bateria
com **Vitest** (`npm run test:etapa11` roda só ela).

| #   | Teste obrigatório                                   | Onde                                   | Tipo        |
|-----|-----------------------------------------------------|----------------------------------------|-------------|
| T01 | Ambiente retangular                                 | `geometria.test.ts`                    | automático  |
| T02 | Ambiente com 5 paredes                              | `geometria.test.ts`                    | automático  |
| T03 | Ambiente com 6 paredes                              | `geometria.test.ts`                    | automático  |
| T04 | Ambiente em L                                       | `geometria.test.ts`                    | automático  |
| T05 | Canto de 45°                                        | `geometria.test.ts`                    | automático  |
| T06 | Canto de 82°                                        | `geometria.test.ts`                    | automático  |
| T07 | Geometria parcial definida por diagonal             | `geometria.test.ts`                    | automático  |
| T08 | Inconsistência pequena (2–3 cm) → aviso             | `geometria.test.ts`                    | automático  |
| T09 | Inconsistência grande → alerta e pendência          | `geometria.test.ts`                    | automático  |
| T10 | Porta próxima ao canto                              | `elementos.test.tsx`                   | automático  |
| T11 | Janela com peitoril (`J01 120×100 P=110`)           | `elementos.test.tsx`                   | automático  |
| T12 | Parede interna PI01 sem criar parede externa        | `elementos.test.tsx`                   | automático  |
| T13 | Subambiente com croqui separado                     | `elementos.test.tsx`                   | automático  |
| T14 | "Leva para" por ID                                  | `relacoes.test.ts`                     | automático  |
| T15 | P01 da Sala ligada à P02 da Cozinha                 | `relacoes.test.ts`                     | automático  |
| T16 | Parede compartilhada sem alterar medidas            | `relacoes.test.ts`                     | automático  |
| T17 | Renomear ambiente sem quebrar relação               | `relacoes.test.ts`                     | automático  |
| T18 | Renomear parede sem quebrar relação                 | `relacoes.test.ts`                     | automático  |
| T19 | Excluir ambiente relacionado                        | `relacoes.test.ts`                     | automático  |
| T20 | Persistência após fechar e reabrir (IndexedDB)      | `persistencia.test.ts` (fake-indexeddb)| automático  |
| T21 | Uso no celular                                      | `mobile.test.ts` + roteiro abaixo      | parcial     |

## Verificação manual (navegador real)

**Celular (T21)** — em um aparelho ou no modo responsivo do navegador (390×844):

1. A navegação aparece recolhida; "Projeto e ambientes" abre e fecha a árvore.
2. Os formulários ficam em coluna única; o teclado numérico abre nos campos de medida.
3. O mini croqui e o status da geometria ficam visíveis abaixo do formulário.
4. Adicionar parede, porta e PI01 não exige rolagem horizontal.

**Persistência no navegador (complementa T20)**:

1. Digite medidas e aguarde "Salvo".
2. Feche a aba (ou o navegador) e reabra: o projeto, o ambiente aberto e as medidas voltam.
3. Com a rede desligada (DevTools → Offline), edite e recarregue: os dados continuam.
4. Medidas com mais casas (ex.: 4,123456) e campos vazios são preservados como digitados.
