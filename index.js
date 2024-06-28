import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bodyParser from "body-parser";
import { App } from "@octokit/app";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const privateKey = fs.readFileSync(
  path.join(_dirname, process.env.PRIVATE_KEY_PATH),
  "utf8"
);

const githubconnection = new App({
  appId: process.env.APP_ID,
  privateKey: privateKey,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI; // Using an environment variable for security
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const ThanksSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  packagename: { type: String, required: true },
  modules: { type: Array, required: true },
  personalnotes: { type: Object, required: false },
  status: { type: String, required: true },
  userid: { type: String, required: true },
  contributors: { type: Array, required: true },
});

const Thanks = mongoose.model("Thanks", ThanksSchema);

const EditUrlThanksSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  packagename: { type: String, required: true },
  modules: { type: Array, required: true },
  personalnotes: { type: Object, required: false },
  status: { type: String, required: true },
  userid: { type: String, required: true },
  githubUrl: { type: String, required: true },
});

const EditUrlThanks = mongoose.model("EditUrlThanks", EditUrlThanksSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, required: false },
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

const PythonPackageSchema = new mongoose.Schema({
  installname: { type: String, required: true },
  usename: { type: String, required: true },
  github: { type: String, required: false },
});

const PythonPackage = mongoose.model("PythonPackage", PythonPackageSchema);

const BlockedPythonPackageSchema = new mongoose.Schema({
  usename: { type: String, required: true },
  installname: { type: String, required: true },
});

const BlockedPythonPackage = mongoose.model(
  "BlockedPythonPackage",
  BlockedPythonPackageSchema
);

async function getJSRepo(packageName) {
  try {
    const endpoint = `https://registry.npmjs.org/${packageName}`;
    const res = await fetch(endpoint);
    const data = await res.json();
    const repoURL = data.repository.url;
    return repoURL;
  } catch (error) {
    return false;
  }
}

async function getFile(owner, repo, element) {
  if (element == "") {
    return "";
  }
  const query = element + " in:file language:python repo:" + owner + "/" + repo;
  console.log("Query:", query);
  const octokit = await githubconnection.getInstallationOctokit(
    process.env.INSTALLATION_ID
  );
  try {
    const response = await octokit.request("GET /search/code", {
      q: query,
      per_page: 1,
    });

    const item = response.data.items[0].path;
    return item;
  } catch (error) {
    console.error("Error:", error);
  }
}

// function to return file paths of specific modules from GitHub repository
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

async function getContributors(owner, repo, filePath) {
  const octokit = await githubconnection.getInstallationOctokit(
    process.env.INSTALLATION_ID
  );
  let topCommits = [];
  const contributors = [];
  console.log("Getting contributors for:", filePath);
  if (filePath == "") {
    let response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner: owner,
      repo: repo,
      per_page: 10,
      page: 1,
    });
    topCommits = topCommits.concat(response.data);
    topCommits.forEach((foundCommit) =>
      contributors.push({
        email: foundCommit.commit.author.email,
        name: foundCommit.commit.author.name,
      })
    );
    return contributors;
  } else {
    let response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner: owner,
      repo: repo,
      path: filePath,
      per_page: 10,
      page: 1,
    });
    topCommits = topCommits.concat(response.data);
    topCommits.forEach((foundCommit) =>
      contributors.push({
        email: foundCommit.commit.author.email,
        name: foundCommit.commit.author.name,
      })
    );
    return contributors;
  }
}

// potentially get rid of the modules arg here
function getGithub(scriptPath, args = [packageName]) {
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
      const result = JSON.parse(data);
      if (result.githubURL == "No GitHub URL found") {
        resolve(false);
      }
      resolve(result.githubURL);
    });
  });
}
// returns github url is found for package
app.post("/getGithub", async (req, res) => {
  const packageName = req.body.packageName;
  if (req.body.language == "javascript") {
    let githubURL = await getJSRepo(packageName);
    if (!githubURL) {
      res.status(200).json({
        url: "No GitHub URL found",
      });
    } else {
      //check if github url starts with git+ and remove it
      if (githubURL.startsWith("git+")) {
        githubURL = githubURL.slice(4);
        //check if githuburl ends with .git and remove it
        if (githubURL.endsWith(".git")) {
          githubURL = githubURL.slice(0, -4);

          res.status(200).json({
            url: githubURL,
          });
        } else {
          res.status(200).json({
            url: "No GitHub URL found",
          });
        }
      } else {
        res.status(200).json({
          url: "No GitHub URL found",
        });
      }
    }
  } else {
    if (req.body.language == "python") {
      const pythonpackage = await PythonPackage.findOne({
        usename: packageName,
      });
      let githubURL = "";
      if (pythonpackage && pythonpackage.github) {
        githubURL = pythonpackage.github;
      } else {
        if (pythonpackage) {
          let installname = pythonpackage.installname;
          githubURL = await getGithub("script.py", [installname]);
        } else {
          githubURL = await getGithub("script.py", [packageName]);
        }
      }
      if (!githubURL) {
        res.status(200).json({
          url: "No GitHub URL found",
        });
      } else {
        res.status(200).json({
          url: githubURL,
        });
      }
    }
  }
});

//write new user to the database and return the _id of the user
app.post("/addUser", async (req, res) => {
  const username = "temp";
  const user = new User({
    username,
  });
  await user.save();
  const user_id = user._id;
  res.status(200).json({
    message: "User saved",
    id: user_id,
  });
});

//update name of user in database
app.post("/updateUser", async (req, res) => {
  const { id, username } = req.body;
  await User.findByIdAndUpdate(id, { username: username });
  res.status(200).json({
    message: "User updated",
  });
});

//get thanks sent by a user from the database
app.post("/getThanks", async (req, res) => {
  const { id } = req.body;
  const thanks = await Thanks.find({ userid: id });
  res.status(200).json({
    thanks: thanks,
  });
});

app.post("/filterPythonImports", async (req, res) => {
  const { imports } = req.body;
  const allowedPackages = {};
  console.log("running");

  // Iterate through the provided object
  for (const [key, value] of Object.entries(imports)) {
    // Check if the package is in the database
    for (let i = 0; i < value.length; i++) {
      const blockedpythonpackage = await BlockedPythonPackage.findOne({
        usename: value[i].packageName,
      });
      if (!blockedpythonpackage) {
        if (allowedPackages[key]) {
          allowedPackages[key].push(value[i]);
        } else {
          allowedPackages[key] = [value[i]];
        }
      }
    }
  }
  res.status(200).json({
    filteredLineNumbersName: allowedPackages,
  });
});

// write new thanks to the database
app.post("/addThanks", async (req, res) => {
  const { packagename, modules, personalnotes, userid, language } = req.body;
  console.log("Request:", req.body);
  if (language == "python") {
    //check if package is in python packages database and get installname and github url
    const pythonpackage = await PythonPackage.findOne({ usename: packagename });
    let githubURL = "";
    if (pythonpackage && pythonpackage.github) {
      githubURL = pythonpackage.github;
    } else {
      if (pythonpackage) {
        let installname = pythonpackage.installname;
        githubURL = await getGithub("script.py", [installname]);
      } else {
        githubURL = await getGithub("script.py", [packagename]);
      }
    }
    console.log("GitHub URL:", githubURL);
    if (githubURL) {
      //if last character is / remove it
      if (githubURL[githubURL.length - 1] == "/") {
        githubURL = githubURL.slice(0, -1);
      }
      let splitstring = "https://github.com/";
      if (githubURL.includes("https")) {
        splitstring = "https://github.com/";
      } else {
        splitstring = "http://github.com/";
      }
      const [owner, repo] = githubURL.split(splitstring)[1].split("/");
      const moduleFilePaths = await getAllFiles(owner, repo, modules);
      console.log("ModuleFilePaths:" + moduleFilePaths);

      let contributors = [];
      let unfilteredContributors = [];

      for (let i = 0; i < modules.length; i++) {
        let filePath = moduleFilePaths[i];
        let contributorEmails = await getContributors(owner, repo, filePath);
        contributorEmails.forEach((element) => {
          unfilteredContributors.push(element);
        });
      }

      // remove duplicates
      contributors = unfilteredContributors.filter(
        (contributor, index, self) =>
          index ===
          self.findIndex(
            (t) => t.email === contributor.email && t.name === contributor.name
          )
      );

      console.log("Contributors:", contributors);

      const thanks = new Thanks({
        packagename,
        modules,
        personalnotes,
        status: "pending",
        userid,
        contributors,
      });
      await thanks.save();
      if (pythonpackage && !pythonpackage.github) {
        pythonpackage.github = githubURL;
        await pythonpackage.save();
      } else {
        if (!pythonpackage) {
          const pythonpackage = new PythonPackage({
            installname: packagename,
            usename: packagename,
            github: githubURL,
          });
          await pythonpackage.save();
        }
      }
      res.status(200).json({
        message: "Thanks saved",
      });
    }
  }
});

// write new thanks to the database
app.post("/addEditUrlThanks", async (req, res) => {
  const { packagename, modules, personalnotes, userid, language, githubUrl } = req.body;
  console.log("Request:", req.body);
  
  const thanks = new EditUrlThanks({
    packagename,
    modules,
    personalnotes,
    status: "pending",
    userid,
    githubUrl
  });
  
  await thanks.save();
  res.status(200).json({
    message: "Thanks saved",
  });
  
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
