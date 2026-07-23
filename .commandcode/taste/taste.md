# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# tooling

- Use bun with turbopack for monorepo projects (do not switch to npm for deployment; use bun commands for package management, not npm). Confidence: 0.85
- Use bare specifiers (no `.js` extension) in TypeScript import paths for bundler-based projects. Confidence: 0.65
- Use "PagePilot" consistently as the project/app name (not the directory name "html-slop"). Confidence: 0.88
- Use a single root `.env` file symlinked to workspace locations for environment variable management. Confidence: 0.70
- Use a single root `.gitignore` symlinked to workspace locations for consistent ignore rules. Confidence: 0.70

# architecture
- Route all API/mutation operations through tRPC, not directly to storage (for security). Confidence: 0.65
