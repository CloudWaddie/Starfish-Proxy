const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building executable...');

const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
}

const pluginsSource = path.join(__dirname, 'plugins');
const pluginsDest = path.join(buildDir, 'plugins');

if (fs.existsSync(pluginsSource)) {
    if (fs.existsSync(pluginsDest)) {
        fs.rmSync(pluginsDest, { recursive: true, force: true });
    }
    fs.cpSync(pluginsSource, pluginsDest, { recursive: true });
}

const sqliteSource = path.join(__dirname, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node');
const sqliteDest = path.join(buildDir, 'node_sqlite3.node');
if (fs.existsSync(sqliteSource)) {
    fs.copyFileSync(sqliteSource, sqliteDest);
    console.log('Copied node_sqlite3.node to build directory.');
} else {
    console.error('Could not find node_sqlite3.node. Please run npm install.');
    process.exit(1);
}

try {
    execSync('npx pkg src/proxy.js --target node18-win-x64 --output build/starfish-proxy.exe', { stdio: 'inherit' });
    console.log('Build completed: build/starfish-proxy.exe');
} catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
}
