import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// PostgreSQL connection pool for pool
const poolConfig = {
  connectionString: process.env.NEON_POSTGRES1,
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

    // Ensure tables exist
    const sqlQuery = fs.readFileSync("model/db.sql", "utf-8");
    await client.query(sqlQuery);

    console.log("Tables ensured to exist.");

    client.release();
  } catch (err) {
    console.error("Database connection error (pool):", err);
  }
})();