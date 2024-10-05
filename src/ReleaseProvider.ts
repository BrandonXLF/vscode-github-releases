import * as vscode from 'vscode';
import { RemoteList } from './RemoteList';
import { Release, ReleaseAsset, Remote } from './Remote';

export class RemoteItem extends vscode.TreeItem {
    constructor(public remote: Remote) {
        super(remote.identifier, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'repo';
    }
}

export class ReleaseItem extends vscode.TreeItem {
    constructor(public readonly release: Release) {
        let prefix = '';

        if (release.draft) {
            prefix = '[Draft] ';
        } else if (release.remote.isLatest(release)) {
            prefix = '[Latest] ';
        }

        super(
            prefix + release.title,
            vscode.TreeItemCollapsibleState.Collapsed,
        );

        this.contextValue = 'release';
    }
}

export class AssetItem extends vscode.TreeItem {
    constructor(
        public readonly asset: ReleaseAsset,
        first = false,
    ) {
        super(asset.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'asset';

        if (first) {
            this.iconPath = vscode.ThemeIcon.File;
        }
    }
}

export class TagItem extends vscode.TreeItem {
    static readonly TagIcon = new vscode.ThemeIcon('tag');

    constructor(
        public readonly remote: Remote,
        public readonly tagName: string,
    ) {
        super(`Tag: ${tagName}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'tag';
        this.iconPath = TagItem.TagIcon;
    }
}

export class MessageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly iconPath?: vscode.ThemeIcon | vscode.Uri,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'message';
    }
}

export class ReleaseProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    private readonly onDidChangeTreeDataEmitter =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    constructor(
        ctx: vscode.ExtensionContext,
        private readonly remotes: RemoteList,
    ) {
        ctx.subscriptions.push(
            remotes.onDidRemoteListChange(() =>
                this.onDidChangeTreeDataEmitter.fire(null),
            ),
        );
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            if (!this.remotes.list.length) {
                return [new MessageItem('No GitHub repositories found')];
            }

            if (this.remotes.list.length > 1) {
                return this.remotes.list.map(
                    (remote) => new RemoteItem(remote),
                );
            }

            element = new RemoteItem(this.remotes.list[0]);
        }

        if (element instanceof RemoteItem) {
            const releases = await element.remote.getReleases();

            if (!releases.length) {
                return [new MessageItem('No releases found')];
            }

            return releases.map((release) => new ReleaseItem(release));
        }

        if (element instanceof ReleaseItem) {
            const formattedDate = new Intl.DateTimeFormat(vscode.env.language, {
                dateStyle: 'medium',
                timeStyle: 'medium',
            }).format(
                new Date(
                    element.release.publishDate ?? element.release.createDate,
                ),
            );

            const children: vscode.TreeItem[] = [
                new MessageItem(
                    `${element.release.author} at ${formattedDate}`,
                    vscode.Uri.parse(element.release.authorIcon),
                ),
                new TagItem(element.release.remote, element.release.tag),
                new MessageItem('——'),
            ];

            children.push(
                ...element.release.desc
                    .split(/\n/g)
                    .map(
                        (line, i) =>
                            new MessageItem(
                                line.trim(),
                                i === 0
                                    ? new vscode.ThemeIcon('output-view-icon')
                                    : undefined,
                            ),
                    ),
            );

            if (element.release.assets.length) {
                children.push(
                    new MessageItem('——'),
                    ...element.release.assets.map(
                        (asset, i) => new AssetItem(asset, i === 0),
                    ),
                );
            }

            return children;
        }

        return [];
    }

    refresh() {
        this.onDidChangeTreeDataEmitter.fire(null);
    }
}
