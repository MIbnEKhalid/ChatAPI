import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

const poolConfig = {
  connectionString: process.env.NEON_POSTGRES,
  ssl: {
    rejectUnauthorized: true,
  },
};

export const pool = new Pool(poolConfig);

(async () => {
  try {
    const client = await pool.connect();
    client.release();
  } catch (err) {
    console.error("Database connection error (pool):", err);
  }
})();