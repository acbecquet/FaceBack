# Run FaceBack on your iPhone from a borrowed Mac (free provisioning)

This gets the native app onto your physical iPhone using only a **free Apple ID** (no $99 Developer Program) and a **USB cable**, so you can confirm the app works before paying.
Free-provisioned apps run for **7 days**, then need a re-run from Xcode to renew.

## Prerequisites (on the friend's Mac)

- **Xcode 16 or newer**, installed from the App Store (this project generates an Xcode 16 project format; older Xcode cannot open it).
- Your own **Apple ID** (free - do NOT need the Developer Program).
- Your **iPhone** and a **USB-to-Lightning / USB-C cable**.

## Part A - Get the code and generate the project

1. Open **Terminal**.
2. Install Homebrew if it is not already there (skip if `brew --version` works):
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Install XcodeGen:
   ```
   brew install xcodegen
   ```
4. Clone the repo and switch to the port branch:
   ```
   git clone https://github.com/acbecquet/FaceBack.git
   cd FaceBack
   git checkout native-swiftui-port
   ```
5. Generate the Xcode project and open it:
   ```
   cd ios
   xcodegen generate
   open FaceBack.xcodeproj
   ```

## Part B - Sign with your free Apple ID

6. In Xcode: **Xcode menu -> Settings -> Accounts -> "+" -> Apple ID**, and sign in with your Apple ID.
   This gives you a free "Personal Team."
7. In the left Project navigator, click the blue **FaceBack** project, then select the **FaceBack** target, then the **Signing & Capabilities** tab.
8. Tick **Automatically manage signing**.
9. Set **Team** to **"Your Name (Personal Team)"**.
10. If you see an error like "the bundle identifier is not available," change **Bundle Identifier** to anything unique, for example `com.yourname.faceback`.
    Free provisioning registers it automatically.

## Part C - Connect and run on your iPhone

11. Plug the iPhone into the Mac. On the phone, tap **Trust This Computer** and enter your passcode.
12. In Xcode's top toolbar (the device selector next to the Run button), choose **your iPhone** from the list.
    The first time, Xcode may spend a minute "preparing" the device - let it finish.
13. Click **Run** (the play button, or Cmd+R).
    Xcode builds, signs with your personal team, installs, and launches the app.

## Part D - Trust the app on the iPhone (first run only)

14. If the phone says "Untrusted Developer," go to **Settings -> General -> VPN & Device Management**, tap your Apple ID under "Developer App," and tap **Trust**.
15. Launch FaceBack again from the home screen (or press Run again in Xcode).

## Part E - Test the real end-to-end flow

The app talks to the live backend at `https://faceback.acb-apps.com`.

16. On the **Sign In** screen, sign in with your existing FaceBack account, or create one (username + email).
    You will get a **6-digit code by email**; enter it.
17. If asked, add your **Nano Banana 2 / Gemini key**.
18. On the **Camera** screen, grant camera permission, then either point at a face and tap the round shutter, or tap the **photo** button (bottom-left) to pick an existing photo.
19. Watch it **generate**, then land on the **side-by-side Original / Back** result.
20. Tap **Save**, grant Photos permission, and confirm it lands in your Photos.
21. Try **Retry** / **Discard**, the **switch-camera** button, and check that the **front camera preview and the saved image are both mirrored** (what you frame is what you get).

## If something goes wrong

- **Sign-in or generate fails with a network error:** the backend URL may be off. It is set in `ios/FaceBack/AppConfig.swift` to `https://faceback.acb-apps.com/api`. Tell me the correct origin and I will fix it.
- **"Could not launch" / provisioning error:** re-check Part B (team selected, unique bundle id) and that the phone is unlocked and trusted.
- **App disappears after ~7 days:** that is the free-provisioning limit. Re-run from Xcode to renew, or move to the Developer Program + TestFlight for a durable install.
