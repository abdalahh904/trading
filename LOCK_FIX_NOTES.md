# Dependency Lock Fix — v1.5.1

The release includes an explicit `react-is@19.3.0` dependency because Recharts declares `react-is` as a peer dependency. The package was present in package.json's resolved dependency graph but missing from package-lock.json, which caused `npm ci` to stop with `EUSAGE` and `Missing: react-is@19.3.0 from lock file`.

The Windows one-click installer now also performs an automatic package-lock-only repair and retries `npm ci` if the initial clean install reports a lockfile mismatch.
