FROM denoland/deno:1.44.2

ARG DITTO_DOMAIN
ARG DITTO_UPLOADER_CONFIG

ENV DITTO_DOMAIN=${DITTO_DOMAIN}
ENV DITTO_UPLOADER_CONFIG=${DITTO_UPLOADER_CONFIG}
ENV PORT 5000

WORKDIR /app
RUN mkdir -p data
COPY . .
RUN deno cache src/server.ts
RUN deno task headless:setup
CMD deno task start
