
# TODO: check if this works, and consider replacing with alpine or something
FROM ubuntu:22.04

WORKDIR /app

RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

CMD ["node", "expressjs-amend.js"]

