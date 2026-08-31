import mysql, { type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { config } from './config.js'

export const db = mysql.createPool({
  uri: config.MYSQL_URL,
  connectionLimit: 20,
  maxIdle: 10,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  timezone: 'Z',
  decimalNumbers: true,
})

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function one<T extends RowDataPacket>(sql: string, values: unknown[] = []) {
  const [rows] = await db.query<T[]>(sql, values)
  return rows[0] ?? null
}
