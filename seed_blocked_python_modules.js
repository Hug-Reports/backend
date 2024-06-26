import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";

dotenv.config();

const mongoUri = process.env.MONGODB_URI; // Using an environment variable for security
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const BlockedPythonPackageSchema = new mongoose.Schema({
  usename: { type: String, required: true },
  installname: { type: String, required: true },
});

const BlockedPythonPackage = mongoose.model(
  "BlockedPythonPackage",
  BlockedPythonPackageSchema
);

const fileStream = fs.createReadStream("blocked_python_modules.txt");
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

const importData = async () => {
  for await (const line of rl) {
    //read the line as usename and remove any whitespace
    const usename = line.trim();
    const blockedpythonpackage = new BlockedPythonPackage({
      usename,
      installname: usename,
    });
    await blockedpythonpackage.save();
    console.log(`Inserted: ${usename} as ${usename}`);
  }
  console.log("Data import completed.");
  mongoose.connection.close();
};

importData().catch((error) => {
  console.error("Error importing data:", error);
  mongoose.connection.close();
});
