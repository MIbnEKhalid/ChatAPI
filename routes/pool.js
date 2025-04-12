import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

// PostgreSQL connection pool for pool
const poolConfig = {
  connectionString: process.env.NEON_POSTGRES,
  ssl: {
    rejectUnauthorized: true,
  },

};

export const pool = new Pool(poolConfig);
export const dblogin = pool; // Export the pool instance for use in other modules
// Test connection for pool
(async () => {
  try {
    const client = await pool.connect();
    const dbName = process.env.IsDeployed === "true" ? "Neon" : "local";
    console.log("Connected to " + dbName + " PostgreSQL database (pool)!");
    client.release();
  } catch (err) {
    console.error("Database connection error (pool):", err);
  }
})();