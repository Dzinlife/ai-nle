# ai-nle Monorepo

This is a monorepo using pnpm workspaces and Turborepo.

## Structure

```
ai-nle/
├── packages/
│   ├── ai-nle/          # Main application (TanStack Start)
│   └── react-skia-lite/ # ESM version of react-native-skia for web
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Development

Run all packages in development mode:

```bash
pnpm dev
```

Run a specific package:

```bash
pnpm --filter ai-nle dev
pnpm --filter react-skia-lite dev
```

### Building

Build all packages:

```bash
pnpm build
```

Build a specific package:

```bash
pnpm --filter ai-nle build
pnpm --filter react-skia-lite build
```

### Testing

```bash
pnpm test
```

### Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
pnpm lint
pnpm format
pnpm check
```

## Packages

### ai-nle

Main application built with TanStack Start, React Router, and Tailwind CSS.

### react-skia-lite

ESM version of react-native-skia for web. This package is being developed to port react-native-skia to a web-compatible ESM version.

## Learn More

- [TanStack Start](https://tanstack.com/start)
- [TanStack Router](https://tanstack.com/router)
- [Turborepo](https://turbo.build/)
- [pnpm workspaces](https://pnpm.io/workspaces)
