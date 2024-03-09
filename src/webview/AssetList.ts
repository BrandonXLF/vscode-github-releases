import {
    html,
    repeat,
    Observable,
    customElement,
    FASTElement,
    observable,
    attr,
    css,
} from '@microsoft/fast-element';
import { TextField } from '@vscode/webview-ui-toolkit';
import { registerAssetItem } from './AssetItem';
import { Asset } from '../types/webview';

const template = html<AssetListElement>`
    ${repeat(
        (x) => x.list,
        html<Asset>`<asset-item
            :name=${(x) => x.name}
            @delete=${(x, c) => c.parent.removeAsset(x)}
            @rename=${(x, c) =>
                c.parent.renameAsset(x, (c.event as CustomEvent).detail)}
        ></asset-item>`,
    )}
`;

const styles = css`
    :host {
        display: none;
    }
`;

export class AssetListElement extends FASTElement {
    @attr empty = true;
    @observable editing?: Asset;
    nameInput?: TextField;

    private assets: Asset[] = [];
    private usedNames = new Set<string>();
    private deletedAssets = new Map<number, string>();
    private renamedAssets = new Map<number, [string, string]>();

    appendAsset(asset: Asset) {
        if (this.usedNames.has(asset.name)) {
            return false;
        }

        this.assets.push(asset);
        Observable.notify(this, 'list');

        this.usedNames.add(asset.name);
        this.$fastController.element.style.display = 'block';

        return true;
    }

    removeAsset(asset: Asset) {
        if (!asset.new) {
            this.deletedAssets.set(asset.id, asset.name);
            this.renamedAssets.delete(asset.id);
        }

        this.assets = this.assets.filter((x) => x !== asset);
        Observable.notify(this, 'list');

        this.usedNames.delete(asset.name);

        if (!this.assets.length) {
            this.$fastController.element.style.display = 'none';
        }
    }

    renameAsset(asset: Asset, newName: string) {
        if (!asset.new) {
            this.renamedAssets.set(asset.id, [asset.name, newName]);
        }

        asset.name = newName;

        this.usedNames.delete(asset.name);
        this.usedNames.add(newName);
    }

    setState(
        assets: Asset[],
        deletedAssets: [number, string][],
        renamedAssets: [number, [string, string]][],
    ) {
        this.deletedAssets = new Map(deletedAssets);
        this.renamedAssets = new Map(renamedAssets);

        this.assets = assets;
        Observable.notify(this, 'list');

        this.$fastController.element.style.display = this.assets.length
            ? 'block'
            : 'none';
    }

    get list() {
        Observable.track(this, 'list');
        return [...this.assets.values()];
    }

    get deleted() {
        return [...this.deletedAssets.entries()];
    }

    get renamed() {
        return [...this.renamedAssets.entries()];
    }
}

export function registerAssetList() {
    registerAssetItem();

    customElement({
        name: 'asset-list',
        template,
        styles,
    })(AssetListElement);
}
