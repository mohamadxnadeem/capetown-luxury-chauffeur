# Deploying Cape Town Concierge — admin app

This is the runbook for shipping installable builds. Internal distribution only
(TestFlight + Android APK). When you eventually go public on the App Store / Play
Store, switch the `production` profile in `eas.json` and follow the App Store /
Play Console submission flow.

## One-time setup

### 1. Install eas-cli

```bash
npm install -g eas-cli
```

(Or use `npx eas-cli@latest <command>` if you don't want it globally.)

### 2. Log in to Expo

```bash
eas login
```

Use your Expo account email + password. If you don't have an account yet:

```bash
eas register
```

### 3. Link this project to your Expo account

From the repo root:

```bash
eas init
```

This will:

- Detect the project and prompt for confirmation.
- Generate a `projectId` and write it into `app.json` under `expo.extra.eas.projectId`.
- You'll need to also manually replace `"owner": "REPLACE_WITH_YOUR_EXPO_USERNAME"`
  in `app.json` with your Expo username (e.g. `"owner": "alice"`).

### 4. Credentials — let EAS manage them

EAS handles app signing for both platforms automatically. The first time you run
a build, it will:

- iOS: ask for your Apple ID + password → generate certificates + provisioning
  profiles → store them in EAS.
- Android: generate a keystore → store it in EAS.

Just say "yes" to the prompts. Don't manually upload anything unless you have
specific reason to.

## Building

### Internal preview (Android — APK)

```bash
eas build --platform android --profile preview
```

Output: a signed `.apk` file hosted at a EAS URL. Open the URL on any Android
phone → tap install → allow "install from unknown sources" the first time → done.

### Internal preview (iOS — TestFlight)

```bash
eas build --platform ios --profile preview
```

Note: this creates a `.ipa` for **ad-hoc internal distribution**, which means
testers' device UDIDs must be registered. For TestFlight (way easier — anyone you
invite by email can install), use the production profile instead:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

The submit command uploads to App Store Connect. From there:

1. Open https://appstoreconnect.apple.com
2. Find this app under "Apps"
3. Go to "TestFlight" tab
4. Wait ~10-30 minutes for Apple to finish processing the build
5. Add internal testers (anyone with an Apple ID at your Apple Developer team)
6. They get an email + TestFlight push notification with install link

### Build both platforms at once

```bash
eas build --profile preview         # both Android + iOS
eas build --profile production      # both, for submission
```

## Submitting to the stores

### iOS — first time

1. Open https://appstoreconnect.apple.com → My Apps → "+" → New App.
2. Bundle ID: select `com.capetownluxurychauffeur.app` from the dropdown
   (EAS will have registered it the first time you built).
3. Fill out the required fields:
   - **Name** (App Store name, can differ from app.json): "Cape Town Concierge"
   - **Primary language**: English (South Africa)
   - **SKU**: anything unique, e.g. `ctc-admin-app`
   - **User Access**: Full Access
4. Note the **App Store Connect App ID** (a long number, top of the app page).
5. Find your **Apple Team ID** at https://developer.apple.com → Membership.
6. Replace the placeholders in `eas.json` → `submit.production.ios`:
   - `appleId` — your Apple ID email
   - `ascAppId` — the App Store Connect App ID number
   - `appleTeamId` — your Apple Team ID

Then:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

### Android — first time

1. Open https://play.google.com/console → Create app.
2. App name: "Cape Town Concierge".
3. Default language: English (United Kingdom or South Africa).
4. App type: App.
5. Free or paid: Free.
6. Note that the **package name** must match `com.capetownluxurychauffeur.app`.
7. Generate a service account for submissions:
   - Play Console → Setup → API access → Create new service account
     (links you to Google Cloud Console).
   - Grant it the "Service Account User" role.
   - Generate a JSON key.
   - Download the key, save it as `google-play-service-account.json` in the repo
     root. **This file is gitignored — don't commit it.**
   - Back in Play Console, invite the service account email and give it
     "Release manager" permission.

Then:

```bash
eas build --platform android --profile production
eas submit --platform android --profile production
```

The submit pushes to the **internal testing track** (per `eas.json`). Promote
to closed testing → open testing → production from the Play Console UI when ready.

## Updating the app over the air (OTA)

Once the app is installed via TestFlight / Play Store / APK, **JavaScript-only
changes** can be pushed instantly without a new build:

```bash
eas update --branch preview --message "Tweak booking detail layout"
eas update --branch production --message "Fix the cancel-booking copy"
```

Channels are wired in `eas.json` so the app pulls from the right branch
automatically based on which build the user installed.

**Native changes** (new packages with native modules, new permissions, icon
changes) still require a full rebuild + redistribution.

## Version bumping

Before each new build, bump these in `app.json`:

- `expo.version` — semantic version (e.g. "0.2.1"). Visible to users in stores.
- `expo.ios.buildNumber` — incrementing integer or "x.y.z" string. Required by
  Apple to be unique per upload.
- `expo.android.versionCode` — incrementing integer. Required by Google.

Or use EAS's `appVersionSource: "remote"` (already set in `eas.json`) to have
EAS manage the buildNumber/versionCode for you — you just bump `expo.version`.

## What's already configured

- `eas.json` — preview (internal) + production profiles for both platforms
- `app.json` — version 0.2.0, bundle IDs, permission strings for iOS, brand
  emerald icons + splash
- `.gitignore` — ignores Play service account JSON, Apple .p8/.p12/keystores,
  and any other signing material

## Troubleshooting

- **iOS build fails on first run** with credential errors: run
  `eas credentials` and let EAS regenerate. Often a stale provisioning profile.
- **"App icon missing" warning**: regenerate `assets/icon.png` at exactly
  1024×1024 PNG, no transparency.
- **Apple rejects build**: usually a missing permission usage string. Check
  the rejection email — add the missing `NS*UsageDescription` to
  `app.json → expo.ios.infoPlist`.
- **Build queue is slow on free tier**: paid EAS plan jumps to priority queue.
  Free tier builds can take 20-60 minutes during peak hours.

## Quick reference — most common commands

```bash
eas build -p android --profile preview                    # APK for sideload
eas build -p ios --profile production                     # iOS TestFlight build
eas submit -p ios --profile production                    # upload to TestFlight
eas update --branch preview --message "<fix description>"  # OTA JS update
eas credentials                                            # manage signing
```
