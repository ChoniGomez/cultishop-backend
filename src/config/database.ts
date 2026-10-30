import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || '';
const isSslDisabled = dbUrl.includes('sslmode=disable');

const poolConfig: PoolConfig = {
  connectionString: dbUrl,
  ...(isSslDisabled
    ? { ssl: false }
    : {
        ssl: {
          rejectUnauthorized: false
        }
      })
};

export const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('Conectado a la Base de Datos PostgreSQL');
});
