Combina TRÊS lentes em sequência:
  1. Semgrep (SAST) — code patterns, OWASP, custom rules
  2. Snyk (SCA) — dependency CVEs, container/IaC se aplicável
  3. GitGuardian (secrets) — pre-commit + git history scan
Para acessibilidade: design:accessibility-review skill em paralelo.
Output: tabela severity × component × line × fix recommendation. Sem prosa.
Se severity ≥ HIGH: bloqueia push, requer fix antes.
Cita CWE/CVE IDs onde aplicável.
