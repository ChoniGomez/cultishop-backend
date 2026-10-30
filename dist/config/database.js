"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbUrl = process.env.DATABASE_URL || '';
const isSslDisabled = dbUrl.includes('sslmode=disable');
const poolConfig = {
    connectionString: dbUrl,
    ...(isSslDisabled
        ? { ssl: false }
        : {
            ssl: {
                rejectUnauthorized: false
            }
        })
};
exports.pool = new pg_1.Pool(poolConfig);
exports.pool.on('connect', () => {
    console.log('Conectado a la Base de Datos PostgreSQL');
});
