import pg from "pg";
import dotenv from "dotenv";
// import dns from "dns";

// Force IPv4 connections to avoid IPv6 issues on Render
// dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const { Pool } = pg;

// Database configuration - Use individual parameters for better Render compatibility
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "postgres",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.NODE_ENV === "production"
      ? { require: true, rejectUnauthorized: false }
      : false,
  max: 20,
  idleTimeoutMillis: 300000,
  connectionTimeoutMillis: 100000,
  // Additional options for better connectivity
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

// const dbConfig = {
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false  // Supabase has valid certs, but this is safer
//   },
//   max: 20,
//   idleTimeoutMillis: 30000,
//   connectionTimeoutMillis: 10000
// };


// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Test database connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Database connected successfully at:", result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
};

// Query function with error handling
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === "development") {
      console.log("📊 Query executed:", {
        text,
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    console.error("❌ Database query error:", {
      query: text,
      params,
      error: error.message,
    });
    throw error;
  }
};

// Transaction helper functions
export const beginTransaction = async () => {
  const client = await pool.connect();
  await client.query("BEGIN");
  return client;
};

export const commitTransaction = async (client) => {
  try {
    await client.query("COMMIT");
  } finally {
    client.release();
  }
};

export const rollbackTransaction = async (client) => {
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
};

// Get pool stats
export const getPoolStats = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
};

// Graceful shutdown
export const closePool = async () => {
  try {
    await pool.end();
    console.log("📊 Database pool closed");
  } catch (error) {
    console.error("❌ Error closing database pool:", error);
  }
};

export default pool;
