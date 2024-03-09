import {
    FASTElement,
    attr,
    customElement,
    html,
    ref,
} from '@microsoft/fast-element';
import { Button } from '@vscode/webview-ui-toolkit';
import { WebviewApi } from 'vscode-webview';

const template = html<ButtonInputElement>`
    <vscode-button
        ${ref('button')}
        appearance="secondary"
        @click=${(x) => x.sendRequest()}
    >
        ${(x) => x.prefix}${(x) => x.value || x.placeholder}
    </vscode-button>
`;

export class ButtonInputElement extends FASTElement {
    @attr prefix = '';
    @attr name = '';
    @attr placeholder = '';
    @attr value = '';

    private vscode?: WebviewApi<unknown>;
    button?: Button;

    init(vscode: WebviewApi<unknown>) {
        this.vscode = vscode;
    }

    sendRequest() {
        this.vscode?.postMessage({
            type: `select-${this.name}`,
        });
    }
}

export function registerButtonInput() {
    customElement({
        name: 'button-input',
        template,
    })(ButtonInputElement);
}
