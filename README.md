# Figma-Github Plugin

This plugin helps do the following:

- convert Figma Variables into Design Token JSON and commits to Github.
- Pull latest Design Token JSON from Github and applies changes to Figma.

## Development

Requisites:

- Figma Desktop App. Log in to your Figma account normally.
- "Edit" credentials on Figma. This is required to run plugins in your Figma project. If you do not see the "Plugins" menu, you might not have enough credentials. Consult your manager about this.

Run:

- Install dependencies `pnpm i`
- Run in watch mode: `pnpm run watch`

View in Figma Desktop:

- In Figma Desktop, open your project normally.
- Go to "Plugins" menu (or, right-click in your project)
  - Development > import plugin from manifest
  - Select this project's `manifest.json`

Notes:

- Figma Desktop is an Electron app. You can open the web developer console via `Plugins > Development > Show/Hide console`.
- The plugin has hot-reload thanks to `pnpm run watch`. Enjoy.

## Release

Refer to the official Figma docs on how to publish it for [public](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library) or [private](https://help.figma.com/hc/en-us/articles/4404228629655-Create-private-organization-plugins) use.
