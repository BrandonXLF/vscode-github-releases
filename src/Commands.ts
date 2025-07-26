import * as vscode from 'vscode';
import {
    AssetItem,
    ReleaseItem,
    ReleaseProvider,
    RemoteItem,
    TagItem,
} from './ReleaseProvider';
import { WebviewProvider } from './WebviewProvider';
import { RemoteList } from './RemoteList';

export class Commands {
    static readonly defined: [string, (...args: any[]) => any][] = [];

    static define(id: string) {
        return (_target: Commands, _prop: string, desc: PropertyDescriptor) => {
            Commands.defined.push([id, desc.value]);
        };
    }

    constructor(
        private readonly ctx: vscode.ExtensionContext,
        public remotes: RemoteList,
        public releaseProvider: ReleaseProvider,
        public webviewProvider: WebviewProvider,
    ) {}

    registerAll() {
        Commands.defined.forEach(([id, func]) => {
            this.ctx.subscriptions.push(
                vscode.commands.registerCommand(id, func, this),
            );
        });
    }

    @Commands.define('github-releases.createRelease')
    createRelease() {
        return this.webviewProvider.show();
    }

    @Commands.define('github-releases.refreshReleases')
    refreshReleases() {
        this.releaseProvider.refresh();
    }

    @Commands.define('github-releases.setPage')
    setPage(repo: string, page: number) {
        this.releaseProvider.setPage(repo, page);
        this.releaseProvider.refresh();
    }

    @Commands.define('github-releases.editRelease')
    editRelease(release: ReleaseItem) {
        return this.webviewProvider.show(release.release);
    }

    @Commands.define('github-releases.deleteRelease')
    async deleteRelease(release: ReleaseItem) {
        const action = await vscode.window.showInformationMessage(
            `Are you sure you want to delete release "${release.release.title}" from ${release.release.remote.identifier}?`,
            { modal: true },
            { title: 'Yes' },
        );

        if (action?.title !== 'Yes') return;

        release.release.remote.deleteRelease(release.release.id);
        this.releaseProvider.refresh();
    }

    @Commands.define('github-releases.openRepoReleases')
    openRepoReleases(remoteItem?: RemoteItem) {
        const remote = remoteItem?.remote ?? this.remotes.list[0];

        return vscode.env.openExternal(
            vscode.Uri.parse(`${remote.url}/releases`),
        );
    }

    @Commands.define('github-releases.openRelease')
    openRelease(release: ReleaseItem) {
        return vscode.env.openExternal(vscode.Uri.parse(release.release.url));
    }

    @Commands.define('github-releases.downloadAsset')
    downloadAsset(asset: AssetItem) {
        return vscode.env.openExternal(vscode.Uri.parse(asset.asset.url));
    }

    @Commands.define('github-releases.checkoutTag')
    checkoutTag(tag: TagItem) {
        return tag.remote.checkoutTag(tag.tagName);
    }
}
