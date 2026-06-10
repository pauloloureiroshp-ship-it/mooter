# MooterBench — reproducible container run.
# Build from the REPO ROOT (the bench needs tools/router/classify.js):
#   docker build -f packages/mooter-bench/Dockerfile -t mooter-bench .
#   docker run --rm mooter-bench            # human table
#   docker run --rm mooter-bench --json     # machine-readable
FROM node:20-slim

WORKDIR /bench

# Install bench deps first for layer caching.
COPY packages/mooter-bench/package.json ./package.json
RUN npm install --no-audit --no-fund

# The bench package itself.
COPY packages/mooter-bench/src ./src
COPY packages/mooter-bench/dataset ./dataset
COPY packages/mooter-bench/tests ./tests
COPY packages/mooter-bench/LICENSE packages/mooter-bench/README.md ./

# The REAL frozen classifier (read-only input to the bench) + its one hard
# dependency. quota-tracker is lazily required and safely absent in-container.
COPY tools/router/classify.js /repo/tools/router/classify.js
COPY tools/router/patterns.js /repo/tools/router/patterns.js

ENTRYPOINT ["npx", "tsx", "src/run.ts", "--classifier", "/repo/tools/router/classify.js"]
