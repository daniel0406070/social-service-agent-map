FROM node:22-alpine AS builder
WORKDIR /app
ARG APP_BASE_PATH=/ssp
ENV APP_BASE_PATH=${APP_BASE_PATH}

COPY ssp-map/package*.json ./
RUN npm ci

COPY ssp-map/ ./
COPY bmgg_list.json /tmp/bmgg_with_coords.json

RUN if [ -L public/bmgg_with_coords.json ] || [ ! -e public/bmgg_with_coords.json ]; then \
      rm -f public/bmgg_with_coords.json && cp /tmp/bmgg_with_coords.json public/bmgg_with_coords.json; \
    fi \
    && npm run build

FROM nginx:1.27-alpine AS runner
ENV APP_BASE_PATH=/ssp
COPY --from=builder /app/dist /usr/share/nginx/html
COPY ssp-map/nginx.default.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
