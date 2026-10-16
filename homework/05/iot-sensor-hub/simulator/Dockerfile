# syntax=docker/dockerfile:1

# The simulator has zero npm dependencies (it uses Node's built-in fetch), so a
# single small stage is enough - there is nothing to build or strip out.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json simulator.js ./

# Run as the unprivileged built-in "node" user.
USER node

# API_URL uses Docker's internal DNS name of the backend service.
ENV API_URL=http://backend:3000

CMD ["node", "simulator.js"]
