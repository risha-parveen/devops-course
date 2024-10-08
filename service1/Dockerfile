FROM node:20

WORKDIR /app

COPY /src/package*.json ./

RUN npm install

COPY ./src .

EXPOSE 8199

CMD ["node", "index.js"]