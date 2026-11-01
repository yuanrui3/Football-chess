import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
if (!['build', 'run', 'open'].includes(action)) throw new Error('Use build, run, or open');
const env = { ...process.env };
// This Windows host needs IPv4 for JVM network access, including the wrapper download.
if (process.platform === 'win32') {
  env.JAVA_OPTS = ((env.JAVA_OPTS ?? '') + ' -Djava.net.preferIPv4Stack=true').trim();
  // Avoid Windows launch-context failures creating JVM selector sockets under AppData.
  const sockets = path.join(root, '.mobile-build/s');
  fs.mkdirSync(sockets, { recursive: true });
  env.JAVA_TOOL_OPTIONS = ((env.JAVA_TOOL_OPTIONS ?? '') + ' "-Djdk.net.unixdomain.tmpdir=' + sockets.replaceAll('\\', '/') + '"').trim();
}
const localConfig = path.join(root, 'android/.gradle/config.properties');
if (fs.existsSync(localConfig)) {
  const match = fs.readFileSync(localConfig, 'utf8').match(/^java\.home=(.+)$/m);
  if (match) env.JAVA_HOME = match[1].trim();
}
if (env.JAVA_HOME) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env[pathKey] ?? '');
}
if (!env.ANDROID_HOME && process.platform === 'win32' && env.LOCALAPPDATA) {
  const sdk = path.join(env.LOCALAPPDATA, 'Android/Sdk');
  if (fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (env.ANDROID_HOME) env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
if (!env.CAPACITOR_ANDROID_STUDIO_PATH && process.platform === 'win32') {
  const studio = path.join(env.ProgramFiles ?? 'C:/Program Files', 'Android/Android Studio/bin/studio64.exe');
  if (fs.existsSync(studio)) env.CAPACITOR_ANDROID_STUDIO_PATH = studio;
}
let result;
if (action === 'build') {
  result = process.platform === 'win32'
    ? spawnSync(env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gradlew.bat --no-daemon assembleDebug'], { cwd: path.join(root, 'android'), env, stdio: 'inherit' })
    : spawnSync('bash', ['./gradlew', '--no-daemon', 'assembleDebug'], { cwd: path.join(root, 'android'), env, stdio: 'inherit' });
} else {
  const cap = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
  result = spawnSync(process.execPath, [cap, action, 'android'], { cwd: root, env, stdio: 'inherit' });
}
if (result.error) throw result.error;
process.exit(result.status ?? 1);
