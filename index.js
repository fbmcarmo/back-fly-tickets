require('dotenv').config();
const { Pool } = require('pg');
const { Signer } = require('@aws-sdk/rds-signer');

const {
  DB_NAME = 'postgres',
  DB_USER = 'postgres',
  AWS_REGION = 'us-east-2',
  DB_PORT = 5432,
} = process.env;

const signer = new Signer({
  region: AWS_REGION,
  hostname: process.env.DB_HOST,
  port: Number(DB_PORT),
  username: DB_USER,
});

// O token IAM vale 15 minutos; renova com folga antes de expirar.
let cache = { token: null, expiraEm: 0 };

async function getAuthToken() {
  if (cache.token && Date.now() < cache.expiraEm) return cache.token;
  const token = await signer.getAuthToken();
  cache = { token, expiraEm: Date.now() + 10 * 60 * 1000 };
  return token;
}

function criarPool() {
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: getAuthToken,
    ssl: { rejectUnauthorized: true },
  });
}

async function main() {
  const pool = criarPool();
  try {
    const { rows } = await pool.query('SELECT version()');
    console.log(rows[0].version);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Database error:', err);
  process.exit(1);
});