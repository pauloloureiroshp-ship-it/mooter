import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest baseline — runs any *.test.ts / *.test.tsx under app/.
//
// 2026-08-25: passou a resolver o alias `@/`. Nao e conveniencia — sem ele,
// QUALQUER teste que toque num componente falha a carregar, porque os
// componentes importam `@/app/lib/...` e o `tsconfig` do Next resolve isso e o
// vitest nao. O efeito pratico e que os componentes eram, na pratica, nao
// testaveis: o primeiro teste a olhar para markup renderizado (o do
// `StatuslineCard`, achado da triagem de 25/08) bateu nisto de imediato.
export default defineConfig({
  // JSX pelo runtime automatico do React 19. O `tsconfig` do Next diz
  // `"jsx": "preserve"` (o compilador do Next e que trata disso), e o
  // transformador do vitest herda-o e deixa o JSX cru — dai o `React is not
  // defined`. Ate ao vitest 2 isto era `esbuild: { jsx: 'automatic' }`; o
  // vite 8 (vitest 5) transforma com oxc/rolldown e IGNORA `esbuild.*` em
  // silencio — os 3 ficheiros .tsx da suite passaram a falhar no parse
  // (2026-09-13, subida do vitest por causa de GHSA-5xrq-8626-4rwp).
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
    globals: false,
  },
});
