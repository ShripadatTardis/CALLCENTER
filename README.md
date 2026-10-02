# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/37240618-5b33-498f-b1cc-990b74fa8bea

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/37240618-5b33-498f-b1cc-990b74fa8bea) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## Verification

This repository's TypeScript source is split across three project configs (`tsconfig.app.json` for `src/` browser code, `tsconfig.node.json` for the Vite config, `tsconfig.api.json` for `api/` Vercel functions). The root `tsconfig.json` is a `"files": []` solution file that only exists to give editors (VS Code) cross-project navigation — **a bare `tsc` / `npx tsc --noEmit` against it silently checks zero files and always exits 0**. It is not a valid verification command for this repo.

Use the canonical scripts instead:

```sh
npm run typecheck    # the only valid TypeScript check — genuinely checks src/, api/, and vite.config.ts
npm run verify        # typecheck + production build
npm run verify:full   # verify + the pure-logic deterministic test suites under .tooling/scripts/
npm run lint           # eslint — has pre-existing, unrelated lint debt as of Session 12.8; not part of verify/verify:full
```

`verify:full` deliberately excludes the Playwright/live-browser scripts under `.tooling/scripts/` (they need a running browser against a deployed URL) — those remain available to run manually. See `docs/SESSION_12_8_TYPESCRIPT_AND_VERIFICATION_BASELINE.md` for the full history of this configuration.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/37240618-5b33-498f-b1cc-990b74fa8bea) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
