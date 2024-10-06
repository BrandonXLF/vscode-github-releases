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
const publishBtn = document.getElementById('publish')!;

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
draftCheck.addEventListener('change', () => {
    publishBtn.innerText = draftCheck.checked ? 'Save' : 'Publish';
    saveState();
});

const prereleaseCheck = document.getElementById('prerelease') as Checkbox;
prereleaseCheck.addEventListener('change', () => saveState());

const makeLatestCheck = document.getElementById('makeLatest') as Checkbox;
makeLatestCheck.addEventListener('change', () => saveState());

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
        tag: {
            name: tagInput.value,
            existing: existingTag,
        },
        target: {
            ref: targetInput.value,
            display: targetInput.valueLabel,
        },
        title: titleInput.value,
        desc: descInput.value,
        draft: draftCheck.checked,
        prerelease: prereleaseCheck.checked,
        assets: {
            current: assetList.list,
            deleted: assetList.deleted,
            renamed: assetList.renamed,
        },
        makeLatest: makeLatestCheck.checked,
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
        tagInput.value = state.tag.name;
        existingTag = state.tag.existing;
        targetInput.style.display = existingTag ? 'none' : '';
    }

    if (state.target !== undefined) {
        targetInput.value = state.target.ref;
        targetInput.valueLabel = state.target.display;
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

    if (state.makeLatest !== undefined) {
        makeLatestCheck.checked = state.makeLatest;
    }

    if ('assets' in state && state.assets !== undefined)
        assetList.setState(
            state.assets.current,
            state.assets.deleted,
            state.assets.renamed,
        );

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

publishBtn.addEventListener('click', () => {
    vscode.postMessage({
        type: 'publish-release',
        ...getState(),
    });
});

vscode.postMessage({
    type: 'start',
});
