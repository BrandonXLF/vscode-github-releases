import * as vscode from 'vscode';
import * as git from './types/git';
import gitUrlParse from 'git-url-parse';
import { Remote } from './Remote';
import { Octokit } from '@octokit/rest';

export class RemoteList {
    private readonly onDidRemoteListChangeEmitter = new vscode.EventEmitter<
        Remote[]
    >();
    readonly onDidRemoteListChange = this.onDidRemoteListChangeEmitter.event;

    private knownRemotes: Remote[] = [];

    constructor(
        private readonly octokit: Octokit,
        ctx: vscode.ExtensionContext,
        private git: git.API,
    ) {
        ctx.subscriptions.push(git.onDidChangeState(() => this.updateKnown()));

        this.updateKnown();
    }

    private getRemotes() {
        const remoteUrls: [string, string, git.Repository][] = [];

        this.git.repositories.forEach((repo) => {
            repo.state.remotes.forEach((remote) => {
                if (remote.fetchUrl)
                    remoteUrls.push([remote.fetchUrl, remote.name, repo]);

                if (remote.pushUrl && remote.fetchUrl !== remote.pushUrl)
                    remoteUrls.push([remote.pushUrl, remote.name, repo]);
            });
        });

        return remoteUrls
            .map(([url, name, repo]) => [gitUrlParse(url), name, repo] as const)
            .filter(([url]) => url.source === 'github.com')
            .map(
                ([url, name, repo]) =>
                    new Remote(
                        this.octokit,
                        url.owner,
                        url.name,
                        repo,
                        name,
                        url.toString('https').replace(/\.git$/, ''),
                    ),
            );
    }

    private updateKnown() {
        const newRemotes = this.getRemotes();

        if (
            newRemotes.length === this.knownRemotes.length &&
            newRemotes.every(
                (newRemote, i) =>
                    newRemote.identifier === this.knownRemotes[i].identifier,
            )
        )
            return;

        this.knownRemotes = newRemotes;

        this.onDidRemoteListChangeEmitter.fire(newRemotes);
        vscode.commands.executeCommand(
            'setContext',
            'gitHubReleases:knownGitHubRepos',
            newRemotes.length,
        );
    }

    get list() {
        return this.knownRemotes;
    }
}
