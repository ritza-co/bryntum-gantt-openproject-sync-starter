# How to connect and sync Bryntum Gantt to OpenProject Gantt

This starter template is an npm workspaces TypeScript monorepo that contains a TypeScript client app and an Express server app. The client uses [Vite](https://vite.dev/), which is a development server and bundler. The server uses Express. 

The following npm packages were added to the backend:

- `express`
- `zod`
- `cors`
- `dotenv`

## Install the dependencies

Install the dependencies in the root, frontend and backend, by running the following command from the root directory: 

```sh
npm install-all
```

## Running the frontend and backend apps at the same time

Run the local dev servers for the frontend and backend using the following command:

```sh
npm run dev
```

This runs the frontend and backend apps concurrently using the npm package `concurrently`.

You can access the frontend app at [`http://localhost:5173`](http://localhost:5173) and the backend app at [`http://localhost:1337`](http://localhost:1337).

If you open the frontend app in your browser, you'll see a blank white page.

## Adding npm packages to the frontend or backend app

To add an npm package to the correct app, use the `--workspace` flag with the `npm install` command. For example, to add the `zod` npm package to the `backend`, use the following command from the root directory:

```sh
npm install zod --workspace=backend
```