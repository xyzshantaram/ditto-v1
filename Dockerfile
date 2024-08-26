FROM denoland/deno:1.44.2

ARG DITTO_NSEC
ARG DITTO_DOMAIN
ARG DITTO_UPLOADER_CONFIG

ENV DITTO_NSEC=${DITTO_NSEC}
ENV DITTO_DOMAIN=${DITTO_DOMAIN}
ENV DITTO_UPLOADER_CONFIG=${DITTO_UPLOADER_CONFIG}
ENV PORT 5000

WORKDIR /app
RUN mkdir -p data
COPY . .
RUN deno cache src/server.ts
RUN deno task headless:setup
RUN apt-get update && apt-get install -y unzip curl
RUN deno task soapbox
CMD deno task start
