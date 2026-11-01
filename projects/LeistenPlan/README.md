# LeistenPlan source

Native Android application for a small one-dimensional cutting-planning workflow.
All lengths use integer tenths of a millimetre. There are no runtime network calls,
accounts, analytics, native binaries or requested Android permissions.

## Build and test

Requires JDK 21, Android SDK platform 36 and build-tools 36.0.0. Set `ANDROID_HOME`
to your SDK. The generated Gradle 9.6.0 wrapper verifies the distribution SHA-256.

```sh
./gradlew --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# Start/connect an Android API 26+ device or emulator first:
./gradlew --no-daemon :app:connectedDebugAndroidTest
```

Unit tests include material and multiset conservation across 300 deterministic
randomized cases. Android tests cover validation, a kerf-sensitive exact-fit case,
activity recreation, relaunch, and confirmed/cancelled project reset, plus the visible first-launch explanation and guided shelf example. Unit tests
and instrumentation are separate; an unexecuted device suite is not a passing run.

## Model and limits

The planner uses deterministic best-fit decreasing, not an exact optimizer. One
raw stock length is supported, with up to 20 nonempty rows / 100 requested parts.
Input accepts decimal comma or point with one fractional digit and optional
`length x quantity`. Dimensions are in mm, never silently converted between units.

Adjacent pieces consume one kerf width. A trailing offcut requires a separating
cut; that kerf is deducted before reporting reusable remainder. If the trailing
material is thinner than the blade, only the material present is counted as
loss. A piece exactly equal to raw stock needs no cut. Every board satisfies
`stock = sum(parts) + cutting loss + offcut`. No allowance is added for end trim,
clamping, defects or measurement tolerance. The result is a material-planning
suggestion, not machine control or operating instructions.

`MainActivity` stores inputs when calculating and when leaving the app. A result
is recomputed from the saved inputs after reopening; stale results are hidden
when input changes. A failed write is reported. Reset needs explicit confirmation.
The system share chooser opens only after the user selects Share. Cloud/device
transfer backups are excluded in the manifest and extraction rules.

## AppShelf packaging

Within the AppShelf Git checkout, after the required tests pass:

```sh
python3 scripts/package.py
python3 scripts/package.py --check
```

The source ZIP contains every reviewable source file, including tests, wrapper and
this documentation. Generated outputs, local SDK settings, keys and Git metadata
are excluded. The debug APK is an installable independent test build; production
store signing is outside this repository. The Gradle wrapper is generated from
the official distribution and carries its original license notices. No code from
competing cutting tools is included.
