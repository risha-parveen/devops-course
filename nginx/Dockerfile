FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY .htpasswd /etc/nginx/.htpasswd

EXPOSE 8198
EXPOSE 8197

CMD ["nginx", "-g", "daemon off;"]