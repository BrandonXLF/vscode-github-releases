import * as vscode from 'vscode';
import { basename } from 'path';
import { RemoteList } from './RemoteList';
import { Release, Remote } from './Remote';
import {
    WebviewState,
    WebviewStateMessage,
    PartialWebviewStateMessage,
} from './types/webview';

export class WebviewProvider implements vscode.WebviewViewProvider {
    webviewView?: vscode.WebviewView;

    constructor(
        private readonly ctx: vscode.ExtensionContext,
        private readonly remotes: RemoteList,
    ) {}

    private baseRelease?: Release;
    private state?: WebviewState;
    private remote?: Remote;

    clear() {
        this.baseRelease = undefined;
        this.state = undefined;
        this.remote = undefined;
    }

    async show(release?: Release) {
        this.clear();

        this.baseRelease = release;

        if (release) {
            this.remote = this.baseRelease?.remote;
        } else if (this.remotes.list.length === 1) {
            this.remote = this.remotes.list[0];
        } else {
            this.remote = (
                await vscode.window.showQuickPick(
                    this.remotes.list.map((remote) => ({
                        label: remote.identifier,
                        remote,
                    })),
                    {
                        placeHolder: 'Select GitHub repository',
                    },
                )
            )?.remote;
        }

        if (!this.remote) {
            vscode.window.showInformationMessage('Release creation cancelled.');
            return;
        }

        if (this.webviewView) {
            this.sendStartMessage();
            this.webviewView.show();
        }

        await vscode.commands.executeCommand(
            'setContext',
            'gitHubReleases:createRelease',
            true,
        );
    }

    async hide() {
        this.clear();

        await vscode.commands.executeCommand(
            'setContext',
            'gitHubReleases:createRelease',
            false,
        );
    }

    sendStartMessage() {
        const defaultTarget = this.remote!.localRepo.state.HEAD?.name ?? '';

        return this.webviewView!.webview.postMessage({
            type: 'set-state',
            tag: {
                name: this.state?.tag.name ?? this.baseRelease?.tag ?? '',
                existing: this.state?.tag.existing ?? !!this.baseRelease?.tag,
            },
            target: {
                ref: this.state?.target.ref ?? defaultTarget,
                display: this.state?.target.display ?? defaultTarget,
            },
            title: this.state?.title ?? this.baseRelease?.title ?? '',
            desc: this.state?.desc ?? this.baseRelease?.desc ?? '',
            draft: this.state?.draft ?? this.baseRelease?.draft ?? false,
            prerelease:
                this.state?.prerelease ?? this.baseRelease?.prerelease ?? false,
            assets: {
                current:
                    this.state?.assets.current ??
                    this.baseRelease?.assets.map((asset) => ({
                        new: false,
                        ...asset,
                    })) ??
                    [],
                deleted: this.state?.assets.deleted ?? [],
                renamed: this.state?.assets.renamed ?? [],
            },
        } satisfies WebviewStateMessage);
    }

    async processPublish(data: WebviewState) {
        const newRelease = await this.remote!.updateOrPublishRelease({
            id: this.baseRelease?.id,
            tag: data.tag.name,
            target: data.target.ref,
            title: data.title,
            desc: data.desc,
            draft: data.draft,
            prerelease: data.prerelease,
        });

        if (!newRelease) return;

        if (this.baseRelease) {
            for (let [id, name] of data.assets.deleted) {
                await this.remote!.tryDeleteReleaseAsset(id, name);
            }

            for (let [id, [oldName, newName]] of data.assets.renamed) {
                await this.remote!.tryRenameReleaseAsset(id, oldName, newName);
            }
        }

        for (let asset of data.assets.current) {
            if (!asset.new) continue;

            await this.remote!.tryUploadReleaseAsset(
                newRelease.id,
                asset.name,
                asset.path,
            );
        }

        this.hide();

        vscode.commands.executeCommand('github-releases.refreshReleases');
    }

    async processMessage(data: any) {
        switch (data.type) {
            case 'save-state':
                this.state = data;
                break;
            case 'request-asset': {
                const res = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                });
                const path = res?.[0]?.fsPath;

                if (!path) return;

                this.webviewView!.webview.postMessage({
                    type: 'add-asset',
                    asset: {
                        new: true,
                        name: basename(path),
                        path,
                    },
                });

                break;
            }
            case 'name-in-use':
                vscode.window.showErrorMessage(
                    'A file with that name already exists.',
                );

                break;
            case 'start': {
                this.sendStartMessage();
                break;
            }
            case 'select-tag': {
                const tags = await this.remote!.getTags();
                const localTags = await this.remote!.getLocalTags();

                const tag = await new Promise<string>((resolve) => {
                    const quickPick = vscode.window.createQuickPick();
                    const items = [
                        {
                            label: 'Push a local tag...',
                            showLocal: true,
                        } as vscode.QuickPickItem,
                        {
                            label: 'Remote tags',
                            kind: -1,
                        } as vscode.QuickPickItem,
                        ...tags.map((label) => ({ label })),
                        {
                            label: '',
                            kind: -1,
                        } as vscode.QuickPickItem,
                    ];

                    quickPick.items = items;
                    quickPick.placeholder =
                        'Select an existing tag or enter a name for a new one';

                    quickPick.onDidChangeValue(() => {
                        if (
                            quickPick.value &&
                            !tags.includes(quickPick.value)
                        ) {
                            quickPick.items = [
                                { label: quickPick.value },
                                ...items,
                            ];
                        } else {
                            quickPick.items = items;
                        }
                    });

                    quickPick.onDidAccept(async () => {
                        const selection = quickPick.activeItems[0];
                        quickPick.hide();

                        if ('showLocal' in selection) {
                            const localTag = await vscode.window.showQuickPick(
                                localTags,
                                { placeHolder: 'Select a tag to push' },
                            );

                            if (
                                !localTag ||
                                !(await this.remote!.pushLocalTag(localTag))
                            ) {
                                resolve('');
                                return;
                            }

                            resolve(localTag);
                            return;
                        }

                        resolve(selection.label);
                    });

                    quickPick.show();
                });

                this.webviewView!.webview.postMessage({
                    type: 'set-state',
                    tag: {
                        name: tag,
                        existing: tags.includes(tag),
                    },
                } satisfies PartialWebviewStateMessage);

                break;
            }
            case 'select-target': {
                const targets = [
                    ...(await this.remote!.getBranches()).map((label) => ({
                        value: label,
                        label,
                    })),
                    {
                        value: '',
                        label: '',
                        kind: -1,
                    },
                    ...(await this.remote!.getCommits()).map((commit) => ({
                        value: commit.sha,
                        label: commit.sha.slice(0, 8),
                        detail: commit.message,
                    })),
                ];

                const target = (await vscode.window.showQuickPick(targets, {
                    placeHolder: 'Select a target for the release tag',
                })) ?? { value: '', label: '' };

                this.webviewView!.webview.postMessage({
                    type: 'set-state',
                    target: {
                        ref: target.value,
                        display: target.label,
                    },
                } satisfies PartialWebviewStateMessage);

                break;
            }
            case 'generate-release-notes': {
                const notes = await this.remote!.generateReleaseNotes(
                    data.tag,
                    data.target,
                );

                if (!notes) break;

                await this.webviewView!.webview.postMessage({
                    type: 'set-state',
                    title: notes.title,
                    desc: notes.desc,
                } satisfies PartialWebviewStateMessage);

                break;
            }
            case 'publish-release': {
                this.processPublish(data);
                break;
            }
            case 'cancel':
                this.hide();
        }
    }

    async resolveWebviewView(webviewView: vscode.WebviewView) {
        this.webviewView = webviewView;

        webviewView.onDidDispose(() => {
            if (this.webviewView === webviewView) {
                this.webviewView = undefined;
            }
        });

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage((data) =>
            this.processMessage(data),
        );
    }

    getHtml() {
        const styleURI = this.webviewView!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.ctx.extensionUri, 'out', 'webview.css'),
        );
        const codiconsUri = this.webviewView!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.ctx.extensionUri, 'out', 'codicon.css'),
        );
        const scriptURI = this.webviewView!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.ctx.extensionUri, 'out', 'webview.js'),
        );

        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <link rel="stylesheet" type="text/css" href="${styleURI}" />
                    <link id="codicons" rel="stylesheet" type="text/css" href="${codiconsUri}" />
                </head>
                <body>
                    <div class="button-row">
                        <button-input id="tag" name="tag" placeholder="Choose a tag..."></button-input>
                        <button-input id="target" name="target" prefix="Target: " placeholder="Choose..."></button-input>
                    </div>
                    <div>
                        <vscode-text-field id="title" placeholder="Release title"></vscode-text-field>
                    </div>
                    <div>
                        <vscode-text-area id="desc" placeholder="Release description" rows="10"></vscode-text-area>
                    </div>
                    <div id="generate-container">
                        <vscode-button id="generate" appearance="secondary">Generate Notes</vscode-button>
                    </div>
                    <asset-list id="asset-list"></asset-list>
                    <div>
                        <vscode-button id="add-file">Add File</vscode-button>
                    </div>
                    <div>
                        <vscode-checkbox id="draft">Draft</vscode-checkbox>
                    </div>
                    <div>
                        <vscode-checkbox id="prerelease">Pre-release</vscode-checkbox>
                    </div>
                    <div class="button-row">
                        <vscode-button id="cancel" appearance="secondary">Cancel</vscode-button>
                        <vscode-button id="publish">Publish</vscode-button>
                    </div>
                    <script type="module" src="${scriptURI}"></script>
                </body>
            </html>
        `;
    }
}
