FROM node:24-alpine

RUN apk add --no-cache git

WORKDIR /quartz

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npx", "quartz", "build", "--serve"]
