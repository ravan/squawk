import { defineConfig } from 'wxt';

import packageJson from './package.json';

export default defineConfig({
  manifest: {
    name: 'Squawk',
    description:
      "Squawk is a Chrome extension that lays a transparent markup layer over any web page so a developer can box, circle, scribble, and label what's wrong, then screenshot the result straight to the clipboard for pasting into an AI coding-agent session.",
    version: packageJson.version,
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Toggle Squawk',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    permissions: ['activeTab', 'scripting', 'clipboardWrite'],
    web_accessible_resources: [
      {
        resources: ['fonts/suse-mono/*.woff2'],
        matches: ['<all_urls>'],
      },
    ],
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.content_scripts?.length === 0) {
        delete manifest.content_scripts;
      }
    },
  },
});
