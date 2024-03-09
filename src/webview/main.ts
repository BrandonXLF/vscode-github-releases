import {
    provideVSCodeDesignSystem,
    vsCodeButton,
    vsCodeTextField,
    vsCodeTextArea,
    TextField,
    vsCodeCheckbox,
    Checkbox,
} from '@vscode/webview-ui-toolkit';
import { AssetListElement, registerAssetList } from './AssetList';
import { ButtonInputElement, registerButtonInput } from './ButtonInput';
import { Observable } from '@microsoft/fast-element';
import { PartialWebviewState, WebviewState } from '../types/webview';

const vscode = acquireVsCodeApi();

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeTextField(),
    vsCodeTextArea(),
    vsCodeCheckbox(),
);

registerAssetList();
registerButtonInput();

const generateContainer = document.getElementById('generate-container')!;

const assetList = document.getElementById('asset-list') as AssetListElement;
Observable.getNotifier(assetList).subscribe(
    {
        handleChange: () => saveState(),
    },
    'list',
);

const titleInput = document.getElementById('title') as TextField;
titleInput.addEventListener('input', () => saveState());

const descInput = document.getElementById('desc') as TextField;
descInput.addEventListener('input', () => {
    saveState();
    updateGenerateButton();
});

const draftCheck = document.getElementById('draft') as Checkbox;
draftCheck.addEventListener('change', () => saveState());

const prereleaseCheck = document.getElementById('prerelease') as Checkbox;
prereleaseCheck.addEventListener('change', () => saveState());

const tagInput = document.getElementById('tag') as ButtonInputElement;
tagInput.init(vscode);

const targetInput = document.getElementById('target') as ButtonInputElement;
targetInput.init(vscode);
targetInput.value = 'HEAD';

let existingTag = false;

function updateGenerateButton() {
    generateContainer.style.display = descInput.value ? 'none' : '';
}

function getState() {
    return {
        tag: tagInput.value,
        target: targetInput.value,
        title: titleInput.value,
        desc: descInput.value,
        draft: draftCheck.checked,
        prerelease: prereleaseCheck.checked,
        assets: assetList.list,
        deletedAssets: assetList.deleted,
        renamedAssets: assetList.renamed,
        existingTag: existingTag,
    } satisfies WebviewState;
}

function saveState() {
    vscode.postMessage({
        type: 'save-state',
        ...getState(),
    });
}

function setState(state: PartialWebviewState) {
    if (state.tag !== undefined) {
        tagInput.value = state.tag;
    }

    if (state.target !== undefined) {
        targetInput.value = state.target;
    }

    if (state.title !== undefined) {
        titleInput.value = state.title;
    }

    if (state.desc !== undefined) {
        descInput.value = state.desc;
    }

    if (state.draft !== undefined) {
        draftCheck.checked = state.draft;
    }

    if (state.prerelease !== undefined) {
        prereleaseCheck.checked = state.prerelease;
    }

    if ('assets' in state && state.assets !== undefined)
        assetList.setState(
            state.assets,
            state.deletedAssets,
            state.renamedAssets,
        );

    if (state.existingTag !== undefined) {
        existingTag = state.existingTag;
        targetInput.style.display = existingTag ? 'none' : '';
    }

    saveState();
    updateGenerateButton();
}

window.addEventListener('message', (e) => {
    switch (e.data.type) {
        case 'set-state':
            setState(e.data);
            break;
        case 'add-asset':
            if (!assetList.appendAsset(e.data.asset)) {
                vscode.postMessage({
                    type: 'name-in-use',
                });
            }
    }
});

document.getElementById('generate')?.addEventListener('click', () => {
    vscode.postMessage({
        type: 'generate-release-notes',
        tag: tagInput.value,
        target: targetInput.value,
    });
});

document.getElementById('add-file')?.addEventListener('click', () => {
    vscode.postMessage({
        type: 'request-asset',
    });
});

document.getElementById('cancel')?.addEventListener('click', () => {
    vscode.postMessage({
        type: 'cancel',
    });
});

document.getElementById('publish')?.addEventListener('click', () => {
    vscode.postMessage({
        type: 'publish-release',
        ...getState(),
    });
});

vscode.postMessage({
    type: 'start',
});
