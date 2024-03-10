export type Asset = { name: string } & (
    | { new: true; path: string }
    | { new: false; id: number }
);

export type WebviewState = {
    tag: {
        name: string;
        existing: boolean;
    };
    target: {
        ref: string;
        display: string;
    };
    title: string;
    desc: string;
    draft: boolean;
    prerelease: boolean;
    assets: {
        current: Asset[];
        deleted: [number, string][];
        renamed: [number, [string, string]][];
    };
    makeLatest: boolean;
};

export type PartialWebviewState = Partial<WebviewState>;

export type WebviewStateMessage = {
    type: 'set-state';
} & WebviewState;

export type PartialWebviewStateMessage = {
    type: 'set-state';
} & PartialWebviewState;
