const { build, context } = require('esbuild');
const copyStaticFiles = require('esbuild-copy-static-files');

const args = process.argv.slice(2);
const PROD = args.includes('--production');

// @ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

// https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js
/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });

        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });

            console.log('[watch] build finished');
        });
    },
};

/** @type BuildOptions */
const baseConfig = {
    bundle: true,
    minify: PROD,
    sourcemap: !PROD
};

// Config for extension source code (to be run in a Node-based context)
/** @type BuildOptions */
const extensionConfig = {
    ...baseConfig,
    platform: 'node',
    mainFields: ['module', 'main'],
    format: 'cjs',
    entryPoints: ['./src/extension.ts'],
    outfile: './out/extension.js',
    external: ['vscode'],
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const webviewConfig = {
    ...baseConfig,
    target: 'es2020',
    format: 'esm',
    entryPoints: ['./src/webview/main.ts'],
    outfile: './out/webview.js',
    plugins: [
        copyStaticFiles({
            src: './node_modules/@vscode/codicons/dist/codicon.css',
            dest: './out/codicon.css',
        }),
        copyStaticFiles({
            src: './node_modules/@vscode/codicons/dist/codicon.ttf',
            dest: './out/codicon.ttf',
        }),
        copyStaticFiles({
            src: './src/webview/main.css',
            dest: './out/webview.css',
        }),
    ],
};

/** @type BuildOptions */
const watchConfig = {
    plugins: [esbuildProblemMatcherPlugin],
};

// Build script
(async () => {
    try {
        if (args.includes('--watch')) {
            // Build and watch extension and webview code
            const ctx1 = await context({
                ...extensionConfig,
                ...watchConfig,
            });

            const ctx2 = await context({
                ...webviewConfig,
                ...watchConfig,
            });

            await ctx1.watch();
            await ctx2.watch();
        } else {
            // Build extension and webview code
            await build(extensionConfig);
            await build(webviewConfig);
        
            console.log('build complete');
        }
    } catch (err) {
        process.stderr.write(err.stderr);
        process.exit(1);
    }
})();
