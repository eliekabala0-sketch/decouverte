import 'dotenv/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`)

const sourceUrl = process.env.SUPABASE_URL!
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const bucket = process.env.S3_BUCKET!
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'auto',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  forcePathStyle: true,
})

const bucketsResponse = await fetch(`${sourceUrl}/storage/v1/bucket`, { headers: { Authorization: `Bearer ${sourceKey}`, apikey: sourceKey } })
if (!bucketsResponse.ok) throw new Error(`Supabase buckets: ${bucketsResponse.status}`)
const buckets = await bucketsResponse.json() as Array<{ id: string }>
let copied = 0

async function copyFolder(sourceBucket: string, prefix = ''): Promise<void> {
  let offset = 0
  while (true) {
    const response = await fetch(`${sourceUrl}/storage/v1/object/list/${sourceBucket}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sourceKey}`, apikey: sourceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!response.ok) throw new Error(`List ${sourceBucket}/${prefix}: ${response.status}`)
    const objects = await response.json() as Array<{ name: string; id?: string; metadata?: { mimetype?: string } }>
    for (const object of objects) {
    const objectPath = prefix ? `${prefix}/${object.name}` : object.name
    if (!object.id) { await copyFolder(sourceBucket, objectPath); continue }
    const download = await fetch(`${sourceUrl}/storage/v1/object/authenticated/${sourceBucket}/${objectPath}`, {
      headers: { Authorization: `Bearer ${sourceKey}`, apikey: sourceKey },
    })
    if (!download.ok) throw new Error(`Download ${sourceBucket}/${objectPath}: ${download.status}`)
    const bytes = new Uint8Array(await download.arrayBuffer())
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${sourceBucket}/${objectPath}`, Body: bytes, ContentType: object.metadata?.mimetype }))
    copied += 1
    console.log(`copied ${sourceBucket}/${objectPath}`)
    }
    if (objects.length < 1000) break
    offset += objects.length
  }
}

for (const sourceBucket of buckets) await copyFolder(sourceBucket.id)
console.log(`Migration Storage terminee: ${copied} objets copies. Les objets Supabase n'ont pas ete supprimes.`)
