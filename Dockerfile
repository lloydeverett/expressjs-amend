FROM redhat/ubi8:latest

RUN dnf install -y curl && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    dnf install nodejs -y

# NOTE: FROM node:24-alpine would also be fine in place of of the above -
#       we just have a particular need to support the Red Hat UBI

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY . .

CMD ["node", "expressjs-amend.js"]

