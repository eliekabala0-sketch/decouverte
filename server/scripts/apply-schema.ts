import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const mysqlUrl = process.env.MYSQL_URL
if (!mysqlUrl) throw new Error('MYSQL_URL is required')

const schemaPath = fileURLToPath(new URL('../sql/001_mysql_schema.sql', import.meta.url))
const schema = await readFile(schemaPath, 'utf8')
const connection = await mysql.createConnection({ uri: mysqlUrl, multipleStatements: true })

try {
  await connection.query(schema)
  console.log('MySQL schema applied successfully')
} finally {
  await connection.end()
}
