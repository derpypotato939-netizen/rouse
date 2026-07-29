# Toolchain

## Swift does not currently compile on this machine

As of 2026-07-27, the standalone Command Line Tools install is internally inconsistent:

```
error: failed to build module 'Foundation'; this SDK is not supported by the compiler
(the SDK is built with 'Apple Swift version 6.0.3 ... swiftlang-6.0.3.1.5',
 while this compiler is 'Apple Swift version 6.0.3 ... swiftlang-6.0.3.1.10')
```

The SDK and the compiler shipped from different builds, so **no** Swift file that imports Foundation
will compile, and SwiftPM cannot even link its own package manifest (`swift build` fails on
`Package.swift` for every tools-version from 5.7 through 6.0). This is not a project problem —
a one-line `print` fails the same way.

**Fix: install full Xcode**, which brings a matched compiler and SDK.

```bash
xcode-select -p    # currently /Library/Developer/CommandLineTools
```

Install Xcode from the App Store, then point the toolchain at it:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Verify:

```bash
swift build --package-path ios/RouseCore && swift test --package-path ios/RouseCore
```

Xcode is required regardless — AlarmKit needs iOS 26 SDK, Live Activities need a widget extension
target, and App Store submission needs the full toolchain. This just makes it step zero rather than
step one.

## What is verified, and what is not

`ios/RouseCore/` is written and reviewed but **has not been compiled**, because it cannot be on this
machine. Expect to fix ordinary compile errors on first build.

The *design* has been verified independently. `tools/validate.mjs` is a faithful JavaScript port of
the numeric core — RNG, genome sampling, safety rails, feature-space distance, Wake Score, and the
Thompson-sampling bandit — and it runs today:

```bash
node tools/validate.mjs
```

It checks the things where a mistake would cost weeks rather than minutes:

- RNG uniformity
- safety-rail acceptance rate, and that **all 24 bandit arms are reachable**
- novelty threshold across a simulated 365 mornings
- the worst case: 90 consecutive days inside a single family after the bandit converges
- accelerating-tempo step timing (integral of the tempo curve, not `bpm × t`)
- Wake Score monotonicity in every input
- bandit convergence on a synthetic user

Two checks in that harness are *expected to fail*: they exercise the original, buggy safety rail and
exist to document the before/after. See `AGENTS.md`.

Because the port draws its random values in a slightly different order than the Swift, per-seed
genomes will not match between the two — only the statistical properties transfer, which is all the
harness claims.
