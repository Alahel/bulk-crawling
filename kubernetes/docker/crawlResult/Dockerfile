FROM node:12.13.0-alpine
ENV SERVER_PORT=8080
WORKDIR /app
COPY . .
RUN npm i --production
EXPOSE $SERVER_PORT
CMD [ "npm", "run", "start-crawlResult" ]
