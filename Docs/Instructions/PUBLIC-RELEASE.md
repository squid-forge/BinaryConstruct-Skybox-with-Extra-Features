# Public source checks

The destination is https://github.com/squid-forge/BinaryConstruct-Skybox-with-Extra-Features.git.

```sh
npm ci
npm test
npm run build
npm run lint
npm run publication:check
```

The publication check lists intended files and checks for missing notices, broken documentation links, empty/oversized files, private workstation paths and common credential signatures. It cannot guarantee the absence of every secret or defect.

The source package contains application code, presets, assets, current guides, examples and verification scripts. Generated files and local development output are excluded. Required author and asset notices are retained; see LICENSING.md.

See [repository setup](PERSONAL-REPOSITORY-SETUP.md) for Git identity and remote configuration. Main and origin are configured for the repository above.
