import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

// PostgreSQL connection pool for pool1
const pool1Config = {
  connectionString: process.env.NEON_POSTGRES1,
  ssl: {
    rejectUnauthorized: true,
  },
};

export const pool1 = new Pool(pool1Config);

// Test connection for pool1
(async () => {
  try {
    const client = await pool1.connect();
    console.log("Connected to neon PostgreSQL database (pool1)!");
    client.release();
  } catch (err) {
    console.error("Database connection error (pool1):", err);
  }
})();

// PostgreSQL connection pool for pool
const poolConfig =
  process.env.IsDeployed === "true"
    ? {
        connectionString: process.env.NEON_POSTGRES,
        ssl: {
          rejectUnauthorized: true,
        },
      }
    : {
        connectionString: process.env.LOCAL_POSTGRES,
      };

export const pool = new Pool(poolConfig);

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

/*
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

(async () => {
  try {
    console.log("Connected to cloudinary");
  }
  catch (err) {
    console.error("Cloudinary connection error:", err);
  }
})();*/