    const fs = require('fs');
    require('dotenv').config();
    const { Pool } = require('pg');
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    
    const {
            DB_HOST = 'database-fly-tickets.cxu4aceemapg.us-east-2.rds.amazonaws.com',
            DB_NAME = 'postgres',
            DB_SECRET_ARN = "arn:aws:secretsmanager:us-east-2:000911984211:secret:rds!db-218b3d96-d7cc-4062-85a0-36c7094b1843-gBgLns",
            AWS_REGION = 'us-east-2',
            DB_PORT = 5432
    } = process.env;
    
    const sm = new SecretsManagerClient({ region: AWS_REGION });
    
    // Cache simples: evita chamar o Secrets Manager a cada conexão
    let cache = { creds: null, expiraEm: 0 };
    
    async function getCreds() {
      if (cache.creds && Date.now() < cache.expiraEm) return cache.creds;
      const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }));
      const { username, password } = JSON.parse(SecretString);
      cache = { creds: { username, password }, expiraEm: Date.now() + 5 * 60 * 1000 }; // 5 min
      return cache.creds;
    }
    
    async function criarPool() {
      const { username } = await getCreds();
      return new Pool({
        host: DB_HOST,
        port: 5432,
        database: DB_NAME,
        user: username,
        // Lida a cada conexão nova: após uma rotação, o cache expira e pega a senha nova
        password: async () => (await getCreds()).password,
        ssl: { ca: fs.readFileSync(__dirname + '/global-bundle.pem').toString() },
      });
    }
    
    async function main() {
      const pool = await criarPool();
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