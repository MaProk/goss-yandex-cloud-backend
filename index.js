const express = require('express');
const app = express();
const serverless = require('serverless-http');
const session = require("express-session");
const cors = require('cors')
const { faker } = require('@faker-js/faker');

const {Driver, getCredentialsFromEnv, getLogger} = require('ydb-sdk');
const logger = getLogger({level: 'info'});
const endpoint = 'grpcs://ydb.serverless.yandexcloud.net:2135';
const database = '/ru-central1/b1gsdcu3tu12mq5ggma9/etn1oqeciqjq5v0d1l7h';
const authService = getCredentialsFromEnv();
const driver = new Driver({endpoint, database, authService});

async function upsertSessionInfo(id, name) {
  await run();

  await driver.tableClient.withSession(async (session) => {
    const query = `UPSERT INTO session (id, name) VALUES (\"${id}\", \"${name}\");`;
    await session.executeQuery(query);

    logger.info(`Session (${id}, ${name}) has been added!`)
  });
}

async function deleteSessionInfo(id, name) {
  await run();

  await driver.tableClient.withSession(async (session) => {
    const query = `DELETE FROM session WHERE id == \"${id}\" AND name == \"${name}\";`;
    await session.executeQuery(query);

    logger.info(`Session (${id}, ${name}) has been deleted!`)
  });
}

async function selectSessionsInfo() {
  await run();

  return await driver.tableClient.withSession(async (session) => {
    const query = `SELECT id, name FROM session`;

    const {resultSets} = await session.executeQuery(query);

    const sessions = resultSets[0]
      .rows
      .map(row => row.items)
      .map(item => (
          {
            "id": item[0].bytesValue.toString(),
            "name": item[1].bytesValue.toString()
          }
        )
      );

    logger.info(`Sessions (${JSON.stringify(sessions)}) have been selected!`);

    return sessions;
  });
}

async function run() {
  if (!await driver.ready(10000)) {
    logger.fatal(`Driver has not become ready in 10 seconds!`);
    process.exit(1);
  }
}

app.use(express.urlencoded({extended: true}));
app.use(express.json());

const secret = faker.string.uuid();

app.use(cors({credentials: true, origin: true}));

app.use(session({
    secret,
    saveUninitialized: true,
    resave: true,
    cookie : {
      sameSite: 'None',
      secure: true
    }
  })
);

app.get('/login', (req, res) => {
  req.session.name = faker.internet.userName();

  upsertSessionInfo(req.session.id, req.session.name)
    .then(_ => res.send('You are logged in!'));
})

app.get('/logout', (req, res) => {
  const name = req.session.name;

  delete req.session.name;

  deleteSessionInfo(req.session.id, name)
    .then(_ => res.send('You are logged out!'));
})

app.get('/sessions', (req, res) => {
  selectSessionsInfo()
    .then(sessions => res.send(sessions));
});

module.exports.handler = serverless(app);
