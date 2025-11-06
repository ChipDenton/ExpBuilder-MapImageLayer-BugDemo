import { spawn } from 'child_process';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import AdmZip from 'adm-zip';
import filenamify from 'filenamify';
import pluralize from 'pluralize';

import { EXPERIENCE_BUILDER, LOCAL_DIRECTORIES } from './config.mjs';

const require = createRequire(import.meta.url);
const { zipApp } = require(
  path.join(
    path.relative(
      path.dirname(fileURLToPath(import.meta.url)),
      EXPERIENCE_BUILDER.DIRECTORY,
    ),
    'server/src/middlewares/dev/apps/app-download.js',
  ),
);

(async () => {
  // Define helper functions
  const buildFiles = async () => {
    console.log('Building web experience files...');
    const executeNPMRun = (command) =>
      new Promise((resolve, reject) => {
        const cmd = spawn('npm', ['run', command], {
          cwd: `${EXPERIENCE_BUILDER.DIRECTORY}/client`,
          shell: true,
        });
        cmd.on('close', (code) => {
          if (code != 0) {
            reject(code);
          } else {
            resolve();
          }
        });
      });
    await executeNPMRun('build:dev');
    await executeNPMRun('build:prod');
  };

  const downloadResources = async (resources, type, getExport) => {
    if (resources.length) {
      console.log(
        `Downloading ${resources.length} ${pluralize(
          type,
          resources.length,
        )}...`,
      );

      await Promise.allSettled(
        resources.map(async (resource) => {
          const directory = path.join(
            LOCAL_DIRECTORIES.BUILD,
            path.basename(path.dirname(resource.path)),
          );
          await mkdir(directory, { recursive: true });

          const filename = filenamify(
            `${resource.label}_${resource.version}.zip`,
            '',
          );
          const filepath = path.join(directory, filename);

          console.log(
            `Downloading '${resource.label}' ${type} to '${filename}'...`,
          );
          try {
            await unlink(filepath);
          } finally {
            return getExport(filepath, resource);
          }
        }),
      );
    }
  };

  const listResources = async (directory, getInfo) =>
    Promise.all(
      (await readdir(directory)).map(async (name) => {
        try {
          return await getInfo(`${directory}/${name}`);
        } catch {}
      }),
    ).then((resources) => resources.filter((resource) => resource));

  // Execute
  try {
    // Build Experience Builder files
    await buildFiles();

    // Discover configured applications
    const getAppInfo = async (path) => {
      const info = JSON.parse(await readFile(`${path}/info.json`));
      if (info.type === 'Web Experience') {
        const config = JSON.parse(await readFile(`${path}/config.json`));
        return {
          id: info.id,
          owner: info.owner,
          label: info.title || info.name,
          path: path,
          thumbnail: info.thumbnail,
          version: `${process.env.npm_package_version}`,
          clientId: config.attributes?.clientId,
        };
      }
    };
    const apps = await listResources(LOCAL_DIRECTORIES.APPS, getAppInfo);

    // Export applications to build directory
    const getAppExport = async (filepath, app) => {
      // Create zip
      await zipApp(app.id, filepath, app.clientId || undefined);

      // Update cdn path with version
      const zip = new AdmZip(filepath);
      const indexHTML = zip
        .readAsText('index.html')
        .replace(/<base.*\/>/, `<base href="./cdn/${app.version}/"/>`)
        .replace(/(buildNumber[ "][=:] ['"])(\d*)(.*)/, `$1${app.version}$3`);
      zip.updateFile('index.html', Buffer.from(indexHTML, 'utf8'));
      zip.getEntries().forEach((entry) => {
        entry.entryName = entry.entryName.replace(
          /(cdn\/)([^\/]*)(\/.*)/,
          `$1${app.version}$3`,
        );
      });
      zip.writeZip();
    };
    await downloadResources(apps, 'application', getAppExport);

    // Export index page to build directory
    await writeFile(
      path.join(
        LOCAL_DIRECTORIES.BUILD,
        path.basename(LOCAL_DIRECTORIES.APPS),
        'index.html',
      ),
      `<html>
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="initial-scale=1, maximum-scale=1, user-scalable=no"
          />
          <script
            type="module"
            src="https://js.arcgis.com/calcite-components/2.13.0/calcite.esm.js"
          ></script>
          <link
            rel="stylesheet"
            type="text/css"
            href="https://js.arcgis.com/calcite-components/2.13.0/calcite.css"
          />
          <style>
            a {
              text-decoration: none;
              color: var(--calcite-color-text-1);
            }

            calcite-card {
              width: 15.25rem;
            }

            calcite-card-group {
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            }
          </style>
        </head>

        <body>
          <calcite-card-group label="Applications">
            ${apps.map(
              (app) => `
              <a href="./${app.label}">
                <calcite-card label="${app.label}">
                  <img
                    slot="thumbnail"
                    alt="${app.label}"
                    src="./${app.label}/cdn/${app.version}/${app.thumbnail}"
                  />
                  <h2 slot="heading">${app.label}</h2>
                  <div slot="footer-start">${app.owner}</div>
                  <div slot="footer-end">
                    <calcite-chip>${app.version}</calcite-chip>
                  </div>
                </calcite-card>
              </a>`,
            )}
          </calcite-card-group>
        </body>
      </html>`,
    );

    // Discover custom widgets
    const getWidgetInfo = async (path) => {
      const manifest = JSON.parse(await readFile(`${path}/manifest.json`));
      if (manifest.type === 'widget') {
        return {
          id: manifest.name,
          label: manifest.name || manifest.label,
          path: path,
          version: manifest.version || `v${process.env.npm_package_version}`,
        };
      }
    };
    const widgets = await listResources(
      LOCAL_DIRECTORIES.WIDGETS,
      getWidgetInfo,
    );

    // Export widgets to build directory
    const getWidgetExport = async (filepath, widget) => {
      const zip = new AdmZip();

      zip.addLocalFolder(
        path.join(
          EXPERIENCE_BUILDER.DIRECTORY,
          `client/dist-prod/widgets/${widget.id}`,
        ),
      );

      zip.writeZip(filepath);
    };
    await downloadResources(widgets, 'widget', getWidgetExport);
  } catch {}
})();
