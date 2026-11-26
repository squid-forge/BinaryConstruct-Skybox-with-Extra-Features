# Public source checks

The project is publicly maintained at https://github.com/squid-forge/BinaryConstruct-Skybox-with-Extra-Features. Run the checks from a clean clone of the branch you will publish.

```sh
npm ci
npm test
npm run build
npm run lint
npm run publication:check
```

The publication check lists intended files and checks for missing notices, broken documentation links, empty/oversized files, private workstation paths and common credential signatures. It cannot guarantee the absence of every secret or defect.

The source package contains application code, presets, assets, guides, examples, verification scripts, generated help, and license notices. Keep local development output and private project archives in the original workspace. For a hosted build, publish the freshly generated `dist/` directory. See [LICENSING.md](../../LICENSING.md) for bundled notices and terms.

When staging from a local checkout, use `git clone --no-local --single-branch --branch main --no-tags <source> <destination>`. This copies the intended branch history and skips local snapshot refs and unrelated Git objects. Verify the remote and exact branch before pushing. See [repository setup](PERSONAL-REPOSITORY-SETUP.md) for Git identity.
