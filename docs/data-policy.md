# What mooter collects (telemetry, opt-in only)

## We collect (aggregated, k-anon ≥50):
- Prompt SHA-256 hash — NOT prompt text
- Tier chosen + cost — NOT model response
- Pack used + confidence — NOT pack contents
- Latency in ms — NOT request payload

## We never collect:
- Your code (any part, any form)
- Your prompts (text, screenshots, partial)
- Model responses
- Personal identifiers
- Repository URLs or commit messages

## You can revoke anytime
- Run `/mooter share OFF` in your terminal
- Delete `~/.mooter/consent.json`
- Data purged from hub within 30 days
