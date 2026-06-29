# UIRouter

Small route matching, loading, and navigation state router for OpenClaw UI
surfaces.

## Install

```sh
npm install @openclaw/uirouter
```

## Usage

```ts
import { createRouter, definePage } from "@openclaw/uirouter";

const chatPage = definePage({
  id: "chat",
  path: "/chat",
  component: () => import("./chat-page.js"),
});

const router = createRouter({
  routes: [chatPage],
});
```

## Build

```sh
npm run build
```

The package publishes `dist/` with ESM, CommonJS, and TypeScript declarations.
