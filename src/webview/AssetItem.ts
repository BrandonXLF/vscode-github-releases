import {
    html,
    customElement,
    FASTElement,
    when,
    observable,
    ref,
    attr,
    css,
} from '@microsoft/fast-element';
import { TextField } from '@vscode/webview-ui-toolkit';

const codiconsUri = (document.getElementById('codicons')! as HTMLLinkElement)
    .href;

const template = html<AssetItemElement>`
    <link rel="stylesheet" type="text/css" href="${codiconsUri}" />
    ${when(
        (x) => x.editing,
        html<AssetItemElement>`
            <vscode-text-field
                ${ref('nameInput')}
                value="${(x) => x.name}"
                @input=${(x) => {
                    x.name = x.nameInput?.value ?? '';
                    x.$emit('rename', x.name);
                }}
                @keydown=${(x, c) => {
                    if ((c.event as KeyboardEvent).key === 'Enter') {
                        x.editing = false;
                    }

                    return true;
                }}
                @focusout=${(x) => (x.editing = false)}
            ></vscode-text-field>
        `,
        html<AssetItemElement>`
            <span>${(x) => x.name}</span>
            <vscode-button
                appearance="icon"
                aria-label="Delete"
                title="Delete"
                @click=${(x) => x.$emit('delete')}
            >
                <span class="codicon codicon-trash"></span>
            </vscode-button>
            <vscode-button
                appearance="icon"
                aria-label="Rename"
                title="Rename"
                @click=${(x) => (x.editing = true)}
            >
                <span class="codicon codicon-edit"></span>
            </vscode-button>
        `,
    )}
`;

const styles = css`
    :host {
        display: flex;
        align-items: center;
        border-radius: calc(var(--corner-radius-round) * 1px);
    }

    :host(:hover) {
        background: var(--vscode-list-hoverBackground);
    }

    :host > :nth-child(2) {
        flex: 1;
        padding: 4px;
    }
`;

export class AssetItemElement extends FASTElement {
    @attr name = '';
    @observable editing = false;

    nameInput?: TextField;
}

export function registerAssetItem() {
    customElement({
        name: 'asset-item',
        template,
        styles,
    })(AssetItemElement);
}
