// dod_checks.mjs — os 12 itens DoD do T1 (Moo Ranch, §5 da v1.0) como checks executáveis.
// Preencher DEPOIS de T1_SPEC.md ter a tabela verbatim. Cada check:
//   { id, desc, humano?, fn: async (page) => boolean }
// Item não automatizável => humano: true (o harness reporta "n/d (humano)" — nunca finge).
// O harness RECUSA correr enquanto qualquer desc contiver <<TODO.

export const CHECKS = [
  { id: 1, desc: "<<TODO item 1 da T1_SPEC.md>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 2, desc: "<<TODO item 2>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 3, desc: "<<TODO item 3>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 4, desc: "<<TODO item 4>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 5, desc: "<<TODO item 5>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 6, desc: "<<TODO item 6>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 7, desc: "<<TODO item 7>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 8, desc: "<<TODO item 8>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 9, desc: "<<TODO item 9>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 10, desc: "<<TODO item 10>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 11, desc: "<<TODO item 11>>", fn: async () => { throw new Error("por implementar"); } },
  { id: 12, desc: "<<TODO item 12>>", fn: async () => { throw new Error("por implementar"); } },
];
