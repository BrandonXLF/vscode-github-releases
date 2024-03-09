export type Asset = { name: string } & (
    | { new: true; path: string }
    | { new: false; id: number }
);

type AssetInfo = {
    assets: Asset[];
    deletedAssets: [number, string][];
    renamedAssets: [number, [string, string]][];
};

export type WebviewState = {
    tag: string;
    existingTag: boolean;
    target: string;
    title: string;
    desc: string;
    draft: boolean;
    prerelease: boolean;
} & AssetInfo;

export type PartialWebviewState = Omit<Partial<WebviewState>, keyof AssetInfo> &
    (AssetInfo | Record<keyof AssetInfo, undefined> | {});

export type WebviewStateMessage = {
    type: 'set-state';
} & WebviewState;

export type PartialWebviewStateMessage = {
    type: 'set-state';
} & PartialWebviewState;
