import { App } from "@octokit/app";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import { spawn } from "child_process";

dotenv.config();

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const privateKey = fs.readFileSync(
  path.join(_dirname, process.env.PRIVATE_KEY_PATH),
  "utf8"
);

const app = new App({
  appId: process.env.APP_ID,
  privateKey: privateKey,
});

const apps = express();

// Function to run the Python script
function getGithub(scriptPath, args = [packageName, modules]) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", [scriptPath, ...args]);

    // Collect data from the script
    let data = "";
    pythonProcess.stdout.on("data", (chunk) => {
      data += chunk.toString();
    });

    // Handle script errors
    pythonProcess.stderr.on("data", (chunk) => {
      console.error(`Error: ${chunk}`);
    });

    // Resolve the promise when the script completes
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.log("package not found");
      } else {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (error) {
          reject(new Error("Failed to parse JSON from Python script output"));
        }
      }
    });
  });
}

async function getFile(owner, repo, element) {
  const query = element + " in:file language:python repo:" + owner + "/" + repo;
  console.log("Query:", query);
  const octokit = await app.getInstallationOctokit(process.env.INSTALLATION_ID);
  try {
    const response = await octokit.request("GET /search/code", {
      q: query,
      per_page: 3,
    });

    console.log("Response:", response.data.items);

    const item = response.data.items[0].path;
    return item;
  } catch (error) {
    console.error("Error:", error);
  }
}

async function getContributors(owner, repo, filePath) {
  const octokit = await app.getInstallationOctokit(process.env.INSTALLATION_ID);
  let topCommits = [];
  console.log("Getting contributors for:", filePath);
  let response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner: owner,
    repo: repo,
    path: filePath,
    per_page: 10,
    page: 1,
  });
  topCommits = topCommits.concat(response.data);
  const contributors = [];
  topCommits.forEach((foundCommit) =>
    contributors.push(foundCommit.commit.author.email)
  );
  return contributors;
}

async function getAllFiles(owner, repo, modules) {
  const moduleFilePaths = await Promise.all(
    modules.map(async (element) => {
      var fileName = await getFile(owner, repo, element);
      console.log(`FileName for ${element}:`, fileName);
      return fileName;
    })
  );
  return moduleFilePaths;
}

async function main() {
  const modules = [];
  const packageName = "sys";
  const githubURL = await getGithub("script.py", [packageName]);
  console.log("GithubURL:" + githubURL);

  const [owner, repo] = githubURL.split("https://github.com/")[1].split("/");
  const moduleFilePaths = await getAllFiles(owner, repo, modules);
  console.log("ModuleFilePaths:" + moduleFilePaths);

  const moduleContributors = [];
  for (let i = 0; i < modules.length; i++) {
    let moduleName = modules[i];
    let filePath = moduleFilePaths[i];
    console.log("Calling With:" + owner + repo + filePath);
    let contributorEmails = await getContributors(owner, repo, filePath);
    moduleContributors.push({
      moduleName: moduleName,
      contributorEmails: contributorEmails,
    });
  }
  console.log(moduleContributors);
}

main();
