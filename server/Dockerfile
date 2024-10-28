FROM node:22

COPY . .

RUN yarn
RUN yarn build

ENV PORT 8000
EXPOSE 8000

CMD [ "node", "build/main.js" ]
