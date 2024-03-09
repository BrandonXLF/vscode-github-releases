import { ReleaseProvider } from './ReleaseProvider';
import * as vscode from 'vscode';
import * as git from './types/git';
import { WebviewProvider } from './WebviewProvider';
import { RemoteList } from './RemoteList';
import { Octokit } from '@octokit/rest';
import { Commands } from './Commands';

export async function activate(ctx: vscode.ExtensionContext) {
    const gitExtension =
        vscode.extensions.getExtension<git.GitExtension>('vscode.git');

    await gitExtension!.activate();

    const git = gitExtension!.exports.getAPI(1);
    const auth = await vscode.authentication.getSession('github', ['repo'], {
        createIfNone: true,
    });

    if (!auth) {
        vscode.window.showErrorMessage('Failed to get GitHub auth.');
        return;
    }

    const octokit = new Octokit({
        auth: auth.accessToken,
        userAgent: `BrandonXLF/vscode-github-releases v${ctx.extension.packageJSON.version}`,
    });
    const remotes = new RemoteList(octokit, ctx, git);
    const releaseProvider = new ReleaseProvider(ctx, remotes);
    const webviewProvider = new WebviewProvider(ctx, remotes);

    new Commands(ctx, releaseProvider, webviewProvider).registerAll();

    ctx.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'github-releases-create-release',
            webviewProvider,
        ),
        vscode.window.registerTreeDataProvider(
            'github-releases-release-list',
            releaseProvider,
        ),
    );
}
