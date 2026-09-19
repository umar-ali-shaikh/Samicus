import mongoose from "mongoose";

let memoryServer;

export async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    // Binary cache + data dir default under node_modules/.cache, which here sits inside a
    // OneDrive-synced folder — its real-time file locking makes the binary miss the default
    // 10s launch window. Redirect both outside OneDrive and give it more time to start.
    memoryServer = await MongoMemoryServer.create({
      binary: { downloadDir: process.env.MONGOMS_DOWNLOAD_DIR || undefined },
      instance: { launchTimeout: 60000 },
    });
    uri = memoryServer.getUri();
    console.log("MONGODB_URI not set — using in-memory MongoDB for this run.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
