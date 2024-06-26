import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";

dotenv.config();

const mongoUri = process.env.MONGODB_URI; // Using an environment variable for security
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const PythonPackageSchema = new mongoose.Schema({
  installname: { type: String, required: true },
  usename: { type: String, required: true },
  github: { type: String, required: false },
});

const PythonPackage = mongoose.model("PythonPackage", PythonPackageSchema);

const fileStream = fs.createReadStream("mapping.txt");
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

const importData = async () => {
  for await (const line of rl) {
    const [usename, installname] = line.split(":");
    const pythonpackage = new PythonPackage({
      installname,
      usename,
    });
    await pythonpackage.save();
    console.log(`Inserted: ${usename} as ${installname}`);
  }
  console.log("Data import completed.");
  mongoose.connection.close();
};

importData().catch((error) => {
  console.error("Error importing data:", error);
  mongoose.connection.close();
});
