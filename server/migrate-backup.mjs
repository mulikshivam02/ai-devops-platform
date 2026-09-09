import mongoose from "mongoose";
import fs from "fs";
import path from "path";

const source = await mongoose.createConnection(
  "mongodb://127.0.0.1:27017/changelens"
).asPromise();

const db = source.db;

const collections = await db.listCollections().toArray();

const backupDir = path.resolve("../data/changelens-backup");

fs.mkdirSync(backupDir, { recursive: true });

console.log(`Found ${collections.length} collections`);

for (const info of collections) {
  const name = info.name;

  if (name.startsWith("system.")) {
    continue;
  }

  const documents = await db.collection(name).find({}).toArray();

  fs.writeFileSync(
    path.join(backupDir, `${name}.json`),
    JSON.stringify(documents, null, 2)
  );

  console.log(`${name}: ${documents.length} documents`);
}

await source.close();

console.log(`Backup completed: ${backupDir}`);
