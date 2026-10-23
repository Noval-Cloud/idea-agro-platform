# Static preview: the site is built locally (`pnpm build`, with public/explorer in place) and served by nginx.
FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
