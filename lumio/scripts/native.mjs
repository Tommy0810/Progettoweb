// One command to prepare and open the native project:
//   npm run android     (Windows, macOS, Linux)
//   npm run ios         (macOS only)
// Creates the platform folder if missing, copies the game, adds the AdMob
// App ID (without it the app crashes on launch) and opens the IDE.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Google's public TEST App IDs. Replace them with your own before publishing.
const ADMOB_APP_ID = {
  android: process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
  ios: process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
};

const platform = process.argv[2];
const open = !process.argv.includes('--no-open');
if (!['android', 'ios'].includes(platform)) {
  console.error('Usage: node scripts/native.mjs <android|ios> [--no-open]');
  process.exit(1);
}
if (platform === 'ios' && process.platform !== 'darwin') {
  console.error('iOS builds need a Mac with Xcode.');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit', shell: true });

if (!existsSync(platform)) run(`npx cap add ${platform}`);
run(`npx cap sync ${platform}`);

if (platform === 'android') {
  const file = 'android/app/src/main/AndroidManifest.xml';
  let xml = readFileSync(file, 'utf8');
  if (!xml.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    xml = xml.replace(/(<application\b[^>]*>)/, `$1
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="${ADMOB_APP_ID.android}"/>`);
    writeFileSync(file, xml);
    console.log('✔ AdMob App ID added to AndroidManifest.xml');
  }
} else {
  const file = 'ios/App/App/Info.plist';
  let plist = readFileSync(file, 'utf8');
  if (!plist.includes('GADApplicationIdentifier')) {
    plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `	<key>GADApplicationIdentifier</key>
	<string>${ADMOB_APP_ID.ios}</string>
</dict>
</plist>
`);
    writeFileSync(file, plist);
    console.log('✔ AdMob App ID added to Info.plist');
  }
}

if (open) run(`npx cap open ${platform}`);
