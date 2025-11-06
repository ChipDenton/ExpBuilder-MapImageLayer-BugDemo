import { spawn } from "child_process";
import { createWriteStream, existsSync } from "fs";
import { cp, readdir, readFile, unlink, writeFile } from "fs/promises";
import https from "https";

import AdmZip from "adm-zip";
import lnk from "lnk";

import { EXPERIENCE_BUILDER, LOCAL_DIRECTORIES } from "./config.mjs";

(async () => {
  // Define helper functions
  const downloadExperienceBuilder = (version) =>
    new Promise((resolve, reject) => {
      console.log(`Downloading ArcGIS Experience Builder ${version}...`);
      https.get(
        `https://downloads.arcgis.com/dms/rest/download/secured/arcgis-experience-builder-${version}.zip?f=json&folder=software/ExperienceBuilder/${version}`,
        (response) => {
          let data = "";
          response.on("data", (chunk) => (data += chunk));
          response.on("end", () =>
            downloadFile(
              JSON.parse(data).url,
              `arcgis-experience-builder-${version}.zip`
            )
              .then(resolve)
              .catch(reject)
          );
          response.on("error", reject);
        }
      );
    });

  const downloadFile = (url, targetPath) => {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        response
          .pipe(createWriteStream(targetPath))
          .on("close", () => resolve(targetPath))
          .on("error", reject);
      });
    });
  };

  const extractFile = (filePath, targetPath = ".") => {
    console.log(`Extracting ${filePath}...`);
    const zip = new AdmZip(filePath);
    zip.extractAllTo(targetPath, true);
    return targetPath;
  };

  const extractSubPath = (filePath, subPath, targetPath = ".") => {
    const zip = new AdmZip(filePath);
    zip.extractEntryTo(subPath, targetPath, false, true);
  };

  const installNPMPackages = (directory) => {
    return new Promise((resolve, reject) => {
      console.log(`Installing modules in ${directory}...`);
      const cmd = spawn("npm", ["ci"], { cwd: directory, shell: true });
      cmd.stdout.on("data", (data) => console.log(data.toString()));
      cmd.stderr.on("data", (data) => console.error(data.toString()));
      cmd.on("close", (code) => {
        if (code != 0) {
          reject(code);
        } else {
          resolve();
        }
      });
    });
  };

  const makeDirectoryLink = async (source, target, options) => {
    try {
      return await lnk(source, target, {
        ...options,
        type: "directory",
      });
    } catch {
      return await lnk(source, target, {
        ...options,
        type: "junction",
      });
    }
  };

  // Execute
  try {
    // Read version from arguments or default to 1.17
    const version = `${process.argv[2] ?? 1.17}`;

    // Download Experience Builder
    console.log(`Installing ArcGIS Experience Builder ${version}...`);
    const exb_zip = await downloadExperienceBuilder(version);
    await extractFile(exb_zip);
    await installNPMPackages(`${EXPERIENCE_BUILDER.DIRECTORY}/client/`);
    await installNPMPackages(`${EXPERIENCE_BUILDER.DIRECTORY}/server/`);
    await unlink(exb_zip);

    // Apply patch
    if (EXPERIENCE_BUILDER.PATCH_URL) {
      console.log("\nApplying Experience Builder Patches...");
      const patch_zip = await downloadFile(
        EXPERIENCE_BUILDER.PATCH_URL,
        "arcgis-experience-builder-sdk-resources.zip"
      );
      let patch_count = 1;
      while (patch_count > 0) {
        try {
          await extractSubPath(
            patch_zip,
            `arcgis-experience-builder-sdk-resources-master/patches/${version}/patch${patch_count}/arcgis-experience-builder/client/`,
            `${EXPERIENCE_BUILDER.DIRECTORY}/client/`
          );
          patch_count += 1;
        } catch {
          patch_count = 0;
        }
      }
      await unlink(patch_zip);
    }

    // Custom patch to support symlinks
    let webpackConfig = await readFile(
      `${EXPERIENCE_BUILDER.DIRECTORY}/client/webpack.config.js`,
      {
        encoding: "utf-8",
      }
    );
    webpackConfig = webpackConfig.replace(
      "module.exports = extensionsConfig;",
      "module.exports = extensionsConfig.map((c) => ({ ...c, resolve: { ...c.resolve, symlinks: false }}));"
    );
    await writeFile(
      `${EXPERIENCE_BUILDER.DIRECTORY}/client/webpack.config.js`,
      webpackConfig,
      {
        encoding: "utf-8",
      }
    );

    // Create links
    console.log("\nCreating directory links...");
    try {
      await makeDirectoryLink(
        LOCAL_DIRECTORIES.APPS,
        `${EXPERIENCE_BUILDER.DIRECTORY}/server/public/`,
        { force: true }
      );
    } catch {
      console.warn(`Could not create 'apps' symlink. Copying...`);
      await cp(
        LOCAL_DIRECTORIES.APPS,
        `${EXPERIENCE_BUILDER.DIRECTORY}/server/public/apps`,
        {
          recursive: true,
        }
      );
    }
    try {
      await makeDirectoryLink(
        LOCAL_DIRECTORIES.THEMES,
        `${EXPERIENCE_BUILDER.DIRECTORY}/client/your-extensions/`,
        { force: true }
      );
    } catch {
      console.warn(`Could not create 'themes' symlink. Copying...`);
      await cp(
        LOCAL_DIRECTORIES.THEMES,
        `${EXPERIENCE_BUILDER.DIRECTORY}/client/your-extensions/themes`,
        {
          recursive: true,
        }
      );
    }
    try {
      await makeDirectoryLink(
        LOCAL_DIRECTORIES.WIDGETS,
        `${EXPERIENCE_BUILDER.DIRECTORY}/client/your-extensions/`,
        { force: true }
      );
    } catch {
      console.warn(`Could not create 'widgets' symlink. Copying...`);
      await cp(
        LOCAL_DIRECTORIES.WIDGETS,
        `${EXPERIENCE_BUILDER.DIRECTORY}/client/your-extensions/widgets`,
        {
          recursive: true,
        }
      );
    }

    // Install widget third-party libaries
    console.log("\nInstalling widget libraries...");
    const widgets = (
      await readdir(LOCAL_DIRECTORIES.WIDGETS, { withFileTypes: true })
    )
      .filter(
        (dirent) =>
          dirent.isDirectory() &&
          existsSync(`${LOCAL_DIRECTORIES.WIDGETS}/${dirent.name}/package.json`)
      )
      .map((dirent) => dirent.name);
    await Promise.all(
      widgets.map((widget) =>
        installNPMPackages(`${LOCAL_DIRECTORIES.WIDGETS}/${widget}`)
      )
    );
  } catch {}
})();
