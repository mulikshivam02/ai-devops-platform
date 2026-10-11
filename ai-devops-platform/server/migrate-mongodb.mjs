import mongoose from "mongoose";

const source = await mongoose.createConnection(
  "mongodb://127.0.0.1:27017/changelens"
).asPromise();

const target = await mongoose.createConnection(
  "mongodb://127.0.0.1:27018/changelens"
).asPromise();

const collections = await source.db.listCollections().toArray();

console.log(`Found ${collections.length} collections`);

for (const info of collections) {
  const name = info.name;

  if (name.startsWith("system.")) {
    continue;
  }

  const sourceCollection = source.db.collection(name);
  const targetCollection = target.db.collection(name);

  const documents = await sourceCollection.find({}).toArray();

  await targetCollection.deleteMany({});

  if (documents.length > 0) {
    await targetCollection.insertMany(documents, { ordered: false });
  }

  const indexes = await sourceCollection.indexes();

  for (const index of indexes) {
    if (index.name === "_id_") {
      continue;
    }

    const { key, name: indexName, ...options } = index;

    try {
      await targetCollection.createIndex(key, {
        ...options,
        name: indexName
      });
    } catch (error) {
      console.log(`Index ${name}.${indexName}: ${error.message}`);
    }
  }

  console.log(`${name}: copied ${documents.length} documents`);
}

await source.close();
await target.close();

console.log("Migration completed successfully.");
